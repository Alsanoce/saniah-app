// ✅ index.js (backend) const express = require("express"); const bodyParser = require("body-parser"); const cors = require("cors"); const axios = require("axios"); const { parseStringPromise } = require("xml2js"); const admin = require("firebase-admin"); const fetch = require("node-fetch");

const app = express();

app.use(cors({ origin: 'https://saniah.ly', methods: ['GET', 'POST'], allowedHeaders: ['Content-Type'], })); app.options('*', cors());

app.use(bodyParser.json());

const serviceAccount = require("./serviceAccountKey.json"); if (!admin.apps.length) { admin.initializeApp({ credential: admin.credential.cert(serviceAccount), }); } const db = admin.firestore();

async function saveToFirestore(donation) { await db.collection("donations").add(donation); }

async function notifyAdmin({ mosque, phone, amount, sessionID, status, note }) { try { await db.collection("admin_notifications").add({ mosque, phone, amount, sessionID, status, note, timestamp: new Date().toISOString(), }); console.log("🟢 تم تسجيل إشعار إداري"); } catch (err) { console.error("❌ فشل في تسجيل الإشعار الإداري:", err); } }

async function sendWhatsappMessage({ mosque, phone, amount, location }) { const mapsUrl = https://www.google.com/maps?q=${location}; const message = 📦 طلب سقيا مياه:\n🕌 المسجد: ${mosque}\n📞 المتبرع: ${phone}\n💰 القيمة: ${amount} د.ل\n📍 الموقع: ${mapsUrl}; const phoneNumber = "218915100403"; const apikey = "5562266"; const url = https://api.callmebot.com/whatsapp.php?phone=${phoneNumber}&text=${encodeURIComponent(message)}&apikey=${apikey}; try { await fetch(url); console.log("✅ تم إرسال رسالة واتساب"); } catch (err) { console.error("❌ واتساب:", err); } }

app.post("/pay", async (req, res) => { const { customer, amount, mosque } = req.body; if (!customer || !amount || !mosque) { return res.status(400).json({ success: false, message: "بيانات ناقصة" }); }

const xml =  <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"> <soap:Body> <DoPTrans xmlns="http://tempuri.org/"> <Mobile>926388438</Mobile> <Pin>2715</Pin> <Cmobile>${customer}</Cmobile> <Amount>${amount}</Amount> <PW>123@xdsr$#!!</PW> </DoPTrans> </soap:Body> </soap:Envelope>;

try { const { data } = await axios.post("http://62.240.55.2:6187/BCDUssd/newedfali.asmx", xml, { headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "http://tempuri.org/DoPTrans", }, });

const result = await parseStringPromise(data);
const sessionID = result["soap:Envelope"]["soap:Body"][0]["DoPTransResponse"][0]["DoPTransResult"][0];

console.log("📩 sessionID:", sessionID);
res.json({ success: true, sessionID });

} catch (err) { console.error("❌ فشل /pay:", err.message); res.status(500).json({ success: false, message: "فشل في العملية" }); } });

app.post("/confirm", async (req, res) => { const { otp, sessionID, mosque, phone, amount, location } = req.body; if (!otp || !sessionID) { return res.status(400).json({ success: false, message: "بيانات ناقصة" }); }

const xml =  <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"> <soap:Body> <OnlineConfTrans xmlns="http://tempuri.org/"> <Mobile>926388438</Mobile> <Pin>${otp}</Pin> <sessionID>${sessionID}</sessionID> <PW>123@xdsr$#!!</PW> </OnlineConfTrans> </soap:Body> </soap:Envelope>;

try { const response = await axios.post( "http://62.240.55.2:6187/BCDUssd/newedfali.asmx", xml, { headers: { "Content-Type": "text/xml;charset=utf-8", SOAPAction: "http://tempuri.org/OnlineConfTrans", }, } );

const result = await parseStringPromise(response.data);
const status = result["soap:Envelope"]["soap:Body"][0]["OnlineConfTransResponse"][0]["OnlineConfTransResult"][0];

console.log("✅ رد المصرف:", status);

await notifyAdmin({ mosque, phone, amount, sessionID, status, note: status === "OK" ? "تم الدفع" : "فشل في الدفع" });

if (status === "OK") {
  await saveToFirestore({ mosque, phone, amount, sessionID, status: "confirmed", timestamp: new Date().toISOString() });
  await sendWhatsappMessage({ mosque, phone, amount, location });
  return res.json({ success: true, message: "✅ تم الدفع بنجاح" });
} else {
  return res.status(200).json({ success: false, message: "❌ الكود خطأ أو منتهي الصلاحية" });
}

} catch (err) { console.error("❌ خطأ في تأكيد الدفع:", err.message); return res.status(500).json({ success: false, message: "❌ فشل في الاتصال بالخادم" }); } });

app.listen(3000, '0.0.0.0', () => { console.log("🚀 API شغال على http://0.0.0.0:3000"); });

