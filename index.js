const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const axios = require("axios");
const { parseStringPromise } = require("xml2js");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const app = express();

// 🛡️ Middlewares
app.use(cors());
app.use(bodyParser.json());

// 🔐 Firebase Initialization
const serviceAccount = require("./serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

// 💾 Save donation to Firestore
async function saveToFirestore(donation) {
  await db.collection("donations").add(donation);
}

// 📲 Send WhatsApp message
async function sendWhatsappMessage(text) {
  const phone = "218926388438"; // رقم المندوب
  const apikey = "7740180";     // 🔁 غيّرها بمفتاح CallMeBot الخاص بك
  const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodeURIComponent(text)}&apikey=${apikey}`;
  await fetch(url);
}

// ✅ تأكيد الدفع عبر OTP
app.post("/confirm", async (req, res) => {
  const { otp, sessionID, mosque, phone, quantity, location } = req.body;

  if (!otp || !sessionID) {
    return res.status(400).json({ error: "Missing OTP or sessionID" });
  }

  try {
    const xml = `
      <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                     xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                     xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
        <soap:Body>
          <OnlineConfTrans xmlns="http://tempuri.org/">
            <Mobile>926388438</Mobile>
            <Pin>${otp}</Pin>
            <sessionID>${sessionID}</sessionID>
            <PW>123@xdsr$#!!</PW>
          </OnlineConfTrans>
        </soap:Body>
      </soap:Envelope>
    `;

    const { data } = await axios.post(
      "http://62.240.55.2:6187/BCDUssd/newedfali.asmx",
      xml,
      {
        headers: {
          "Content-Type": "text/xml;charset=utf-8",
          SOAPAction: "http://tempuri.org/OnlineConfTrans",
        },
      }
    );

    const parsed = await parseStringPromise(data);
    const result =
      parsed["soap:Envelope"]["soap:Body"][0]["OnlineConfTransResponse"][0][
        "OnlineConfTransResult"
      ][0];

    console.log("🔁 نتيجة تأكيد:", result);

    if (result === "OK") {
      const donation = {
        mosque,
        phone,
        quantity,
        sessionID,
        status: "confirmed",
        timestamp: new Date().toISOString(),
      };

      await saveToFirestore(donation);

      const msg = `📦 طلب سقيا مياه:\n🕌 المسجد: ${mosque}\n📞 المتبرع: ${phone}\n🧊 الكمية: ${quantity}\n📍 الموقع: ${location || "غير محدد"}`;
      await sendWhatsappMessage(msg);

      return res.json({ success: true, message: "تم الدفع بنجاح" });
    } else {
      return res.json({ success: false, message: "❌ الكود خطأ أو منتهي الصلاحية" });
    }
  } catch (error) {
    console.error("❌ خطأ في تأكيد الدفع:", error);
    return res.status(500).json({ success: false, message: "خطأ في السيرفر" });
  }
});

// 🟢 تشغيل السيرفر
const PORT = process.env.PORT || 5051;
app.listen(PORT, () => {
  console.log(`🚀 TDB Proxy server running on port ${PORT}`);
});
