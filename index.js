const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const axios = require("axios");
const { parseStringPromise } = require("xml2js");

const app = express();

// ✅ إعداد CORS الصحيح
app.use(cors({
  origin: 'https://saniah.ly',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));
app.options('*', cors());

app.use(bodyParser.json());

// ✅ نقطة الدفع
app.post("/pay", async (req, res) => {
  const { customer, amount, mosque, quantity } = req.body;

  if (!customer || !amount || !mosque || !quantity) {
    return res.status(400).json({ success: false, message: "بيانات ناقصة" });
  }

  // ⚠️ لا نعدل الرقم، نستخدمه كما هو (مثل test-pay.js)
  const cmobile = customer;

  console.log("📤 إرسال إلى المصرف:", { cmobile, amount, mosque });

  const xml = `
    <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                   xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap:Body>
        <DoPTrans xmlns="http://tempuri.org/">
          <Mobile>926388438</Mobile>
          <Pin>2715</Pin>
          <Cmobile>${cmobile}</Cmobile>
          <Amount>${amount}</Amount>
          <PW>123@xdsr$#!!</PW>
        </DoPTrans>
      </soap:Body>
    </soap:Envelope>`;

  try {
    const { data } = await axios.post("http://62.240.55.2:6187/BCDUssd/newedfali.asmx", xml, {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "http://tempuri.org/DoPTrans"
      }
    });

    const result = await parseStringPromise(data);
    const sessionID = result["soap:Envelope"]["soap:Body"][0]["DoPTransResponse"][0]["DoPTransResult"][0];

    console.log("✅ sessionID:", sessionID);

    // الرد حسب حالة المصرف
    if (sessionID === "BAL") {
      return res.status(400).json({ success: false, message: "رصيد غير كافي" });
    }

    if (sessionID === "ACC") {
      return res.status(400).json({ success: false, message: "رقم الهاتف غير مفعل بالخدمة" });
    }

    if (!sessionID || sessionID.length < 10) {
      return res.status(500).json({ success: false, message: "استجابة غير متوقعة من المصرف" });
    }

    // ✅ نجاح
    res.json({ success: true, sessionID });

  } catch (err) {
    console.error("❌ فشل الاتصال بالمصرف:", err.message);
    return res.status(500).json({ success: false, message: "خطأ في الاتصال بالمصرف", error: err.message });
  }
});

// ✅ تشغيل الخادم
app.listen(3000, '0.0.0.0', () => {
  console.log("🚀 الخادم يعمل على http://0.0.0.0:3000");
});
