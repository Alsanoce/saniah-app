import { useState } from "react";
import axios from "axios";

function OtpConfirmationPage() {
  const [otp, setOtp] = useState("");
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const convertToEnglishDigits = (input) => {
    const arabicDigits = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
    return input.replace(/[٠-٩]/g, d => arabicDigits.indexOf(d).toString());
  };

  const handleSubmit = async () => {
    const cleanOtp = convertToEnglishDigits(otp.trim());

    if (!cleanOtp || cleanOtp.length !== 4) {
      setStatus("❗ يجب إدخال 4 أرقام صحيحة");
      return;
    }

    const donationData = JSON.parse(localStorage.getItem("donation_data"));
    if (!donationData?.sessionID) {
      setStatus("⚠️ لا توجد sessionID. يرجى المحاولة من جديد.");
      return;
    }

    try {
      setLoading(true);

      const res = await axios.post("http://localhost:5051/confirm", {
        otp: cleanOtp,
        sessionID: donationData.sessionID,
      });

      const result = res.data?.result;
      console.log("🔁 نتيجة تأكيد:", result);

      if (result === "PW") {
        setStatus("❌ الكود خطأ أو منتهي الصلاحية");
      } else if (result && result.includes("OK")) {
        setStatus("✅ تم الدفع بنجاح");
        localStorage.removeItem("donation_data");
      } else {
        setStatus(`⚠️ نتيجة غير متوقعة: ${result}`);
      }
    } catch (err) {
      console.error(err);
      setStatus("❌ فشل في الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 space-y-4 max-w-md mx-auto">
      <h2 className="text-xl font-bold text-center">أدخل كود OTP</h2>

      <input
        type="text"
        maxLength={4}
        placeholder="أدخل الكود من الرسالة"
        className="border p-2 w-full text-center text-xl"
        value={otp}
        onChange={(e) => setOtp(e.target.value)}
      />

      <button
        onClick={handleSubmit}
        className="bg-green-600 text-white px-4 py-2 rounded w-full"
        disabled={loading}
      >
        {loading ? "جارٍ التحقق..." : "تأكيد الدفع"}
      </button>

      {status && <div className="mt-2 text-center">{status}</div>}
    </div>
  );
}

export default OtpConfirmationPage;
