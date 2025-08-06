// 06/08/2025
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { parseStringPromise } = require('xml2js');
const admin = require('firebase-admin');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const winston = require('winston');
const app = express();

// ==================== Logger Configuration ====================
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
      maxsize: 5 * 1024 * 1024
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 10 * 1024 * 1024
    }),
    new winston.transports.Console()
  ]
});

// ==================== Firebase Initialization ====================
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.firestore();

// ==================== Middleware ====================
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS.split(',')
}));

app.use(express.json({ limit: '10kb' }));
app.use((req, res, next) => {
  req.requestId = uuidv4();
  logger.info(`Incoming ${req.method} request to ${req.path}`, {
    requestId: req.requestId,
    body: req.body
  });
  next();
});

// ==================== Helper Functions ====================
const buildSoapRequest = (action, data) => {
  const templates = {
    DoPTrans: `
    <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                   xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap:Body>
        <DoPTrans xmlns="http://tempuri.org/">
          <Mobile>${data.phone}</Mobile>
          <Pin>${data.pin || '0000'}</Pin>
          <Cmobile>${data.phone}</Cmobile>
          <Amount>${data.amount}</Amount>
          <PW>${process.env.BANK_PW}</PW>
        </DoPTrans>
      </soap:Body>
    </soap:Envelope>`,

    OnlineConfTrans: `
    <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                   xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap:Body>
        <OnlineConfTrans xmlns="http://tempuri.org/">
          <Mobile>${data.phone}</Mobile>
          <Pin>${data.otp}</Pin>
          <sessionID>${data.sessionID}</sessionID>
          <PW>${process.env.BANK_PW}</PW>
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

const parseBankResponse = async (xmlData, action) => {
  try {
    const parsed = await parseStringPromise(xmlData, {
      explicitArray: false,
      ignoreAttrs: true
    });

    const result = parsed?.['soap:Envelope']?.['soap:Body']?.[`${action}Response`]?.[`${action}Result`];
    
    if (!result) {
      throw new Error(`Invalid ${action} response structure`);
    }

    return result;
  } catch (error) {
    logger.error(`Failed to parse bank response`, {
      error: error.message,
      rawResponse: xmlData.substring(0, 300)
    });
    throw error;
  }
};

// ==================== API Endpoints ====================

/**
 * @route POST /api/pay
 * @desc Initiate payment transaction
 */
app.post('/api/pay', async (req, res) => {
  try {
    const { customer, amount, mosque, quantity } = req.body;

    // Validation
    if (!customer || !amount || !mosque || !quantity) {
      return res.status(400).json({ 
        error: "جميع الحقول مطلوبة",
        details: {
          missing: [
            !customer && "customer",
            !amount && "amount",
            !mosque && "mosque",
            !quantity && "quantity"
          ].filter(Boolean)
        }
      });
    }

    const phone = customer.replace(/\s/g, "");
    if (!/^\+218[92]\d{8}$/.test(phone)) {
      return res.status(400).json({
        error: "رقم الهاتف يجب أن يبدأ بـ +2189 أو +2182 ويتبعه 8 أرقام"
      });
    }

    // Prepare transaction
    const { xml, headers } = buildSoapRequest('DoPTrans', {
      phone,
      amount: parseFloat(amount).toFixed(2)
    });

    // Send to bank
    const response = await axios.post(process.env.BANK_URL, xml, { 
      headers,
      timeout: 15000
    });

    // Parse response
    const sessionID = await parseBankResponse(response.data, 'DoPTrans');

    // Save to Firestore
    await db.collection('transactions').doc(sessionID).set({
      phone,
      amount: parseFloat(amount),
      mosque,
      quantity: parseInt(quantity),
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({
      success: true,
      sessionID,
      phone: phone
    });

  } catch (error) {
    logger.error('Payment processing failed', {
      error: error.message,
      stack: error.stack,
      requestId: req.requestId,
      requestBody: req.body
    });

    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data?.includes?.('<faultstring>') 
      ? error.response.data.match(/<faultstring>([^<]+)<\/faultstring>/)[1]
      : "فشل في عملية الدفع";

    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      requestId: req.requestId
    });
  }
});

// ==================== Server Startup ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Server started on port ${PORT}`);
  console.log(`
  ██████╗  █████╗ ██╗  ██╗███████╗
  ██╔══██╗██╔══██╗██║ ██╔╝██╔════╝
  ██████╔╝███████║█████╔╝ █████╗  
  ██╔══██╗██╔══██║██╔═██╗ ██╔══╝  
  ██████╔╝██║  ██║██║  ██╗███████╗
  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝
  Server ready on port ${PORT}
  `);
});
