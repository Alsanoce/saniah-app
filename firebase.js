// firebase.js (للباك إند)
const admin = require('firebase-admin');

// هنا بتقرأ بيانات الـ Service Account من ملف JSON
// أو ممكن تستخدم متغير بيئي (env) لو تفضل
const serviceAccount = require('./serviceAccountKey.json'); // تأكد من المسار الصحيح

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

module.exports = { admin, db };
