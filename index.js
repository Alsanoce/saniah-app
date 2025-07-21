const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const axios = require("axios");
const { parseStringPromise } = require("xml2js");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const serviceAccount = require("./serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

// 🟡 حفظ التبرع في Firestore (بغض النظر عن النتيجة)
async function saveToFirestore(donation) {
  await db.collection("donations").add(donation);
}

// 🟢 إرسال رسالة واتساب للمندوب عند نجاح الدفع
async function sendWhatsappMessage({ mosque, phone, quantity, location }) {
  const mapsUrl = `https://www.google.com/maps?q=${location}`;
  const message = `📦 طلب سقيا مياه:
🕌 المسجد: ${mosque}
📞 المتبرع: ${phone}
🧊 الكمية: ${quantity} أستيكة
📍 الموقع: ${mapsUrl}`;

  const phoneNumber = "218926388438"; // رقم المندوب
  const apikey = "7740180"; // CallMeBot API Key
  const url = `https://api.callmebot.com/whatsapp.php?phone=${phoneNumber}&text=${encodeURIComponent(message)}&apikey=${apikey}`;

  try {
    await fetch(url);
    console.log("✅ تم إرسال رسالة واتساب");
  } catch (err) {
    console.error("❌ فشل في إرسال رسالة واتساب:", err);
  }
}

// ✅ تأكيد الدفع ومعالجة البيانات
app.post("/confirm", async (req, res) => {
  const { otp, sessionID, mosque, phone, quantity, location } = req.body;

  if (!otp || !sessionID) {
    return res.status(400).json({ error: "Missing OTP or sessionID" });
  }

  try {
    // 🚀 بناء SOAP XML
    const xml = `
      <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                     xmlns:xsd="http://www.w3.org/2001/XMLSchema"
