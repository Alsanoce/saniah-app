require('dotenv').config({ path: '.env', silent: true });
const express = require('express');
const axios = require('axios');
const { parseStringPromise } = require('xml2js');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const winston = require('winston');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// تهيئة التطبيق
const app = express();

// ==================== تهيئة السجل (Logger) ====================
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error', 
      maxsize: 5 * 1024 * 1024,
      maxFiles: 3
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log', 
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5
    }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// ==================== وسائط التطبيق ====================
app.use(helmet());
app.use(cors({
  origin: ["https://saniah.ly", "https://www.saniah.ly"],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-request-id"],
  credentials: true
}));

app.options('*', cors());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// حد معدل الطلبات
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 100, // حد لكل IP
  message: 'لقد تجاوزت عدد الطلبات المسموح بها، يرجى المحاولة لاحقاً'
});
app.use(limiter);

// وسيط تتبع الطلبات
app.use((req, res, next) => {
  req.requestId = uuidv4();
  logger.info(`طلب ${req.method} وارد إلى ${req.path}`, {
    requestId: req.requestId,
    body: req.body,
    ip: req.ip
  });
  next();
});

// ==================== دوال مساعدة ====================
const buildSoapRequest = (action, data) => {
  const templates = {
    DoPTrans: `
    <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                   xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap:Body>
        <DoPTrans xmlns="http://tempuri.org/">
          <Mobile>${escapeXml(data.phone)}</Mobile>
          <Pin>${escapeXml(data.pin || '0000')}</Pin>
          <Cmobile>${escapeXml(data.phone)}</Cmobile>
          <Amount>${escapeXml(parseFloat(data.amount).toFixed(2))}</Amount>
          <PW>${escapeXml(process.env.BANK_PW)}</PW>
        </DoPTrans>
      </soap:Body>
    </soap:Envelope>`,

    OnlineConfTrans: `
    <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                   xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap:Body>
        <OnlineConfTrans xmlns="http://tempuri.org/">
          <Mobile>${escapeXml(data.phone)}</Mobile>
          <Pin>${escapeXml(data.otp)}</Pin>
          <sessionID>${escapeXml(data.sessionID)}</sessionID>
          <PW>${escapeXml(process.env.BANK_PW)}</PW>
        </OnlineConfTrans>
      </soap:Body>
    </soap:Envelope>`
  };

  return {
    xml: templates[action],
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "SOAPAction": `http://tempuri.org/${action}`
    }
  };
};

// دالة لحماية قيم XML من الحقن
function escapeXml(unsafe) {
  if (!unsafe) return '';
  return unsafe.toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const parseBankResponse = async (xmlData, action) => {
  try {
    const parsed = await parseStringPromise(xmlData, {
      explicitArray: false,
      ignoreAttrs: true,
      trim: true
    });

    const result = parsed?.['soap:Envelope']?.['soap:Body']?.[`${action}Response`]?.[`${action}Result`];

    if (!result) {
      throw new Error(`استجابة بنك غير صالحة للعملية ${action}`);
    }

    return result;
  } catch (error) {
    logger.error(`فشل في تحليل استجابة البنك`, {
      error: error.message,
      action: action,
      rawResponse: xmlData.substring(0, 300)
    });
    throw error;
  }
};

// ==================== نقاط نهاية API ====================
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'يعمل',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

app.post('/api/pay', async (req, res) => {
  try {
    // التحقق من الحقول المطلوبة
    const { customer, amount, mosque, quantity } = req.body;
    const missingFields = [];
    if (!customer) missingFields.push('customer');
    if (!amount) missingFields.push('amount');
    if (!mosque) missingFields.push('mosque');
    if (!quantity) missingFields.push('quantity');

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: "جميع الحقول مطلوبة",
        missingFields
      });
    }

    // تنظيف رقم الهاتف والتحقق منه
    const phone = customer.replace(/\s/g, "");
    if (!/^\+218[92]\d{8}$/.test(phone)) {
      return res.status(400).json({ 
        success: false,
        error: "رقم الهاتف يجب أن يبدأ بـ +2189 أو +2182 ويتبعه 8 أرقام" 
      });
    }

    // التحقق من أن المبلغ رقم موجب
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({
        success: false,
        error: "المبلغ يجب أن يكون رقماً موجباً"
      });
    }

    // إعداد طلب SOAP
    const { xml, headers } = buildSoapRequest('DoPTrans', { 
      phone, 
      amount: amountNum.toFixed(2)
    });

    // إرسال الطلب إلى البنك
    const response = await axios.post(process.env.BANK_URL, xml, { 
      headers, 
      timeout: 15000 
    });

    // تحليل الاستجابة
    const sessionID = await parseBankResponse(response.data, 'DoPTrans');

    // تسجيل العملية الناجحة
    logger.info('عملية دفع ناجحة', {
      phone: phone,
      amount: amountNum,
      mosque: mosque,
      quantity: quantity,
      sessionID: sessionID
    });

    // إرجاع الاستجابة
    res.json({ 
      success: true, 
      sessionID, 
      phone,
      amount: amountNum.toFixed(2)
    });

  } catch (error) {
    // تسجيل الخطأ
    logger.error('فشل في معالجة الدفع', {
      error: error.message,
      stack: error.stack,
      requestBody: req.body,
      requestId: req.requestId
    });

    // معالجة أنواع الأخطاء المختلفة
    let statusCode = 500;
    let errorMessage = "فشل في عملية الدفع";

    if (error.response) {
      statusCode = error.response.status || 500;
      if (error.response.data.includes?.('<faultstring>')) {
        errorMessage = error.response.data.match(/<faultstring>([^<]+)<\/faultstring>/)?.[1] || errorMessage;
      }
    } else if (error.request) {
      errorMessage = "لا يوجد استجابة من خادم البنك";
    } else if (error.code === 'ECONNABORTED') {
      errorMessage = "انتهت مهلة الاتصال بخادم البنك";
    }

    // إرجاع خطأ العميل
    res.status(statusCode).json({ 
      success: false, 
      error: errorMessage,
      requestId: req.requestId
    });
  }
});

// معالجة الأخطاء غير المتوقعة
app.use((err, req, res, next) => {
  logger.error('خطأ غير متوقع', {
    error: err.message,
    stack: err.stack,
    requestId: req.requestId
  });

  res.status(500).json({
    success: false,
    error: "حدث خطأ داخلي في الخادم",
    requestId: req.requestId
  });
});

// بدء تشغيل الخادم
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  logger.info(`الخادم جاهز على المنفذ ${PORT}`);
});

// معالجة إيقاف الخادم بشكل أنيق
process.on('SIGTERM', () => {
  logger.info('تلقي إشارة SIGTERM، إيقاف الخادم...');
  server.close(() => {
    logger.info('تم إيقاف الخادم');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('تلقي إشارة SIGINT، إيقاف الخادم...');
  server.close(() => {
    logger.info('تم إيقاف الخادم');
    process.exit(0);
  });
});
