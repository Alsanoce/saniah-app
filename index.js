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

async function saveToFirestore(donation) {
  await db.collection("donations").add(donation);
}

async function notifyAdmin({ mosque, phone, quantity, sessionID, status, note }) {
  try {
    await db.collection("admin_notifications").add({
      mosque,
      phone,
      quantity,
      sessionID,
      status,
      timestamp: new Date().toISOString(),
      note
    });
    console.log("🟢 تم تسجيل إشعار إداري");
  } catch (err) {
    console.error("❌ فشل في تسجيل الإشعار الإداري:", err);
  }
}

async function saveTdbLog({ otp, sessionID, result, rawXML }) {
  try {
    await db.collection("tdb_logs").add({
      otp,
      sessionID,
      soapResult: result,
      rawXML,
      timestamp: new Date().toISOString()
    });
    console.log("📝 تم حفظ لوق المصرف");
  } catch (err) {
    console.error("❌ فشل في حفظ لوق المصرف:", err);
  }
}

async function sendWhatsappMessage({ mosque, phone, quantity, location }) {
  const mapsUrl = `https://www.google.com/maps?q=${location}`;
  const message = `📦 طلب سقيا مياه:
🕌 المسجد: ${mosque}
📞 المتبرع: ${phone}
🧊 الكمية: ${quantity} أستيكة
📍 الموقع: ${mapsUrl}`;

  const phoneNumber = "218926388438";
  const apikey = "7740180";
  const url = `https://api.callmebot.com/whatsapp.php?phone=${phoneNumber}&text=${encodeURIComponent(message)}&apikey=${apikey}`;

  try {
    await fetch(url);
    console.log("✅ تم إرسال رسالة واتساب");
  } catch (err) {
    console.error("❌ فشل في إرسال رسالة واتساب:", err);
  }
}

app.post("/confirm", async (req, res) => {
  const { otp, sessionID, mosque, phone, quantity, location } = req.body;

  if (!otp || !sessionID) {
    return res.status(400).json({ error: "Missing OTP or sessionID" });
  }

  try {
    const xml = \`
      <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                     xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                     xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
        <soap:Body>
          <OnlineConfTrans xmlns="http://tempuri.org/">
            <Mobile>926388438</Mobile>
            <Pin>\${otp}</Pin>
            <sessionID>\${sessionID}</sessionID>
            <PW>123@xdsr$#!!</PW>
          </OnlineConfTrans>
        </soap:Body>
      </soap:Envelope>
    \`;

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

    console.log("📩 الرد الكامل من المصرف:
", data);
const parsed = await parseStringPromise(data);
const result =
  parsed["soap:Envelope"]["soap:Body"][0]["OnlineConfTransResponse"][0]["OnlineConfTransResult"][0];

console.log("📌 القيمة الخام للرد:", JSON.stringify(result));
const status = JSON.stringify(result).includes("OK") ? "confirmed" : "failed";

    const donation = {
      mosque,
      phone,
      quantity,
      sessionID,
      status,
      timestamp: new Date().toISOString(),
      location,
    };

    await saveToFirestore(donation);

    await notifyAdmin({
      mosque,
      phone,
      quantity,
      sessionID,
      status,
      note: status === "confirmed"
        ? "تم الدفع بنجاح"
        : "⚠️ الكود غير صحيح لكن قد يكون تم الخصم"
    });

    await saveTdbLog({
      otp,
      sessionID,
      result,
      rawXML: data
    });

    if (status === "confirmed") {
      await sendWhatsappMessage({ mosque, phone, quantity, location });
      return res.json({ success: true, message: "✅ تم الدفع بنجاح" });
    } else {
      return res.json({
        success: false,
        message: \`⚠️ المصرف لم يؤكد الدفع. الرد: \${result}\`
      });
    }
  } catch (error) {
    console.error("❌ خطأ في تأكيد الدفع:", error);
    return res.status(500).json({ success: false, message: "خطأ في السيرفر" });
  }
});

app.listen(5051, () => {
  console.log("🚀 TDB Proxy server running on port 5051");
});
