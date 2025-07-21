// ✅ Donate.jsx (مُحدث لتخزين sessionID من المصرف)

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

function DonateForm() {
  const [phone, setPhone] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [status, setStatus] = useState(null);
  const [mosques, setMosques] = useState([]);
  const [selectedMosque, setSelectedMosque] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    const fetchMosques = async () => {
      try {
        const res = await fetch("https://firestore.googleapis.com/v1/projects/whater-f15d4/databases/(default)/documents/mosques");
        const data = await res.json();
        const mosquesList = data.documents?.map((doc) => ({
          id: doc.name.split("/").pop(),
          name: doc.fields.name.stringValue
        })) || [];
        setMosques(mosquesList);
      } catch (error) {
        console.error("فشل في جلب المساجد:", error);
      }
    };
    fetchMosques();
  }, []);

  const convertToEnglishDigits = (input) => {
    const arabicDigits = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
    return input.replace(/[٠-٩]/g, d => arabicDigits.indexOf(d).toString());
  };

  const handleDonate = async () => {
    const cleanedPhone = convertToEnglishDigits(phone.trim().replace(/\s/g, ""));

    if (!selectedMosque || !cleanedPhone || quantity < 1) {
      setStatus("❗ الرجاء تعبئة جميع الحقول بشكل صحيح");
      return;
    }

    try {
      const res = await axios.post("https://saniah-app.onrender.com/pay", {
        customer: cleanedPhone,
        quantity: quantity,
      });

      // تخزين sessionID من المصرف مع بيانات التبرع
      localStorage.setItem("donation_data", JSON.stringify({
        phone: cleanedPhone,
        quantity,
        mosque: selectedMosque,
        sessionID: res.data?.sessionID || null
      }));

      navigate("/confirm");
    } catch (err) {
      console.error(err);
      setStatus("❌ فشل الاتصال بالخادم");
    }
  };

  return (
    <div className="p-4 space-y-4 max-w-md mx-auto">
      <h2 className="text-xl font-bold">تبرع بالأستيكة</h2>

      <select
        className="border p-2 w-full"
        value={selectedMosque}
        onChange={(e) => setSelectedMosque(e.target.value)}>
        <option value="">اختر المسجد</option>
        {mosques.map((m) => (
          <option key={m.id} value={m.name}>{m.name}</option>
        ))}
      </select>

      <input
        type="tel"
        placeholder="رقم الهاتف (مثال: 926388438)"
        className="border p-2 w-full"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />

      <input
        type="number"
        min={1}
        className="border p-2 w-full"
        value={quantity}
        onChange={(e) => setQuantity(Number(e.target.value))}
      />

      <button
        onClick={handleDonate}
        className="bg-blue-600 text-white px-4 py-2 rounded w-full"
      >
        تبرع الآن
      </button>

      {status && <div className="mt-2 text-center">{status}</div>}
    </div>
  );
}

export default DonateForm;
