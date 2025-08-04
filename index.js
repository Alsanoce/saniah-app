const express = require('express');
const axios = require('axios');
const { parseStringPromise } = require('xml2js');
const app = express();

app.use(express.json());

// ⚠️ يجب استبدال هذه القيم من متغيرات البيئة
const BANK_PW = "123@xdsr$#!!";
const BANK_URL = "http://62.240.55.2:6187/BCDUssd/newedfali.asmx";

// نقطة نهاية الدفع
app.post('/pay', async (req, res) => {
  const { customer, amount, mosque, quantity } = req.body;

  try {
    // 1. تنظيف رقم الهاتف
    let phone = customer.replace(/\s/g, "");
    
    // 2. التحقق من صحة التنسيق
    const phoneRegex = /^\+2189\d{8}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({ error: "رقم الهاتف غير صحيح" });
    }

    // 3. إنشاء طلب SOAP للمصرف
    const xml = `
    <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                   xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap:Body>
        <DoPTrans xmlns="http://tempuri.org/">
          <Mobile>${phone}</Mobile>
          <Pin>0000</Pin> <!-- سيتم استبداله لاحقاً بـ OTP -->
          <Cmobile>${phone}</Cmobile>
          <Amount>${amount}</Amount>
          <PW>${BANK_PW}</PW>
        </DoPTrans>
      </soap:Body>
    </soap:Envelope>`;

    // 4. إرسال الطلب للمصرف
    const response = await axios.post(BANK_URL, xml, {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "http://tempuri.org/DoPTrans"
      }
    });

    // 5. معالجة الرد من المصرف
    const parsed = await parseStringPromise(response.data);
    const sessionID = parsed['soap:Envelope']['soap:Body'][0]['DoPTransResponse'][0]['DoPTransResult'][0];
    
    // 6. التحقق من صحة sessionID
    if (!sessionID || sessionID.length < 10) {
      return res.status(500).json({ error: "فشل في الحصول على معرف الجلسة من المصرف" });
    }

    // 7. تخزين معلومات الجلسة في قاعدة البيانات (يجب تطبيق هذا)
    // saveSessionToDB(sessionID, phone, amount, mosque, quantity);

    // 8. إرجاع الاستجابة للفرونت إند
    res.json({ sessionID });

  } catch (error) {
    console.error("❌ خطأ في الباك إند:", error);
    
    // تحسين رسائل الخطأ
    let errorMessage = "فشل في الاتصال بالمصرف";
    
    if (error.response) {
      console.error("رد المصرف:", error.response.data);
      
      // محاولة استخراج رسالة الخطأ من XML
      if (error.response.data.includes('<faultstring>')) {
        const faultMatch = error.response.data.match(/<faultstring>([^<]+)<\/faultstring>/);
        if (faultMatch) {
          errorMessage = `خطأ من المصرف: ${faultMatch[1]}`;
        }
      }
    }
    
    res.status(500).json({ error: errorMessage });
  }
});

// نقطة نهاية لتأكيد الدفع
app.post('/confirm', async (req, res) => {
  const { sessionID, otp, phone } = req.body;

  try {
    // 1. إنشاء طلب SOAP لتأكيد الدفع
    const xml = `
    <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                   xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap:Body>
        <OnlineConfTrans xmlns="http://tempuri.org/">
          <Mobile>${phone}</Mobile>
          <Pin>${otp}</Pin>
          <sessionID>${sessionID}</sessionID>
          <PW>${BANK_PW}</PW>
        </OnlineConfTrans>
      </soap:Body>
    </soap:Envelope>`;

    // 2. إرسال طلب التأكيد للمصرف
    const response = await axios.post(BANK_URL, xml, {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "http://tempuri.org/OnlineConfTrans"
      }
    });

    // 3. معالجة الرد من المصرف
    const parsed = await parseStringPromise(response.data);
    const result = parsed['soap:Envelope']['soap:Body'][0]['OnlineConfTransResponse'][0]['OnlineConfTransResult'][0];
    
    // 4. التحقق من نجاح العملية
    if (result.toLowerCase().includes('success')) {
      // تحديث حالة الدفع في قاعدة البيانات (يجب تطبيق هذا)
      // updatePaymentStatus(sessionID, 'success');
      return res.json({ success: true, message: "تمت العملية بنجاح" });
    } else {
      return res.status(400).json({ error: result });
    }

  } catch (error) {
    console.error("❌ خطأ في تأكيد الدفع:", error);
    res.status(500).json({ error: "فشل في تأكيد الدفع" });
  }
});

// بدء الخادم
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ الخادم يعمل على المنفذ ${PORT}`);
});
