
// ✅ DonateForm.jsx (Front-end)
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import axios from "axios";

export default function DonateForm() {
  const [phone, setPhone] = useState("+218");
  const [quantity, setQuantity] = useState(1);
  const [status, setStatus] = useState(null);
  const [mosques, setMosques] = useState([]);
  const [selectedMosque, setSelectedMosque] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const pricePerStick = 6;

  useEffect(() => {
    const fetchMosques = async () => {
      try {
        const snapshot = await getDocs(collection(db, "mosques"));
        const mosquesList = snapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name,
        }));
        setMosques(mosquesList);
      } catch (error) {
        console.error("خطأ في جلب المساجد:", error);
        setStatus("❌ فشل تحميل قائمة المساجد");
      }
    };

    fetchMosques();
  }, []);

  const handleDonate = async () => {
    if (isLoading) return;

    const cleanedPhone = phone.trim(); // ⚠️ تأكد أن المستخدم يدخل +218 بنفسه
    const phoneRegex = /^\+2189\d{8}$/;

    if (!selectedMosque || !phoneRegex.test(cleanedPhone)) {
      setStatus("❗ تأكد من تعبئة البيانات بشكل صحيح");
      return;
    }

    const amount = quantity * pricePerStick;
    setIsLoading(true);
    setStatus(null);

    try {
      console.log("📤 إرسال:", { customer: cleanedPhone, amount, mosque: selectedMosque, quantity });
      const response = await axios.post("https://api.saniah.ly/pay", {
        customer: cleanedPhone,
        amount,
        mosque: selectedMosque,
        quantity,
      });

      const sessionID = (response.data.sessionID || "").toString().trim();

      if (!sessionID || sessionID.length < 10) {
        setStatus("❌ استجابة غير متوقعة من المصرف");
        return;
      }

      navigate("/confirm", {
        state: {
          phone: cleanedPhone,
          quantity,
          mosque: selectedMosque,
          sessionID,
        },
      });

    } catch (error) {
      console.error("❌ فشل:", error);
      setStatus("❌ فشل في إتمام العملية، الرجاء المحاولة لاحقًا");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-center mb-6">نموذج التبرع</h1>

      <div className="space-y-4">
        <div>
          <label className="block mb-1">اختر المسجد:</label>
          <select
            className="w-full p-2 border rounded"
            value={selectedMosque}
            onChange={(e) => setSelectedMosque(e.target.value)}
            disabled={isLoading}
          >
            <option value="">-- اختر مسجد --</option>
            {mosques.map((mosque) => (
              <option key={mosque.id} value={mosque.name}>{mosque.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block mb-1">رقم الهاتف (+2189...):</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full p-2 border rounded"
            disabled={isLoading}
          />
        </div>

        <div>
          <label className="block mb-1">عدد الأستيكات:</label>
          <input
            type="number"
            value={quantity}
            min={1}
            max={50}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="w-full p-2 border rounded"
            disabled={isLoading}
          />
        </div>

        <button
          onClick={handleDonate}
          disabled={isLoading}
          className={`w-full py-2 rounded text-white ${isLoading ? "bg-gray-400" : "bg-green-600 hover:bg-green-700"}`}
        >
          {isLoading ? "جاري المعالجة..." : "التبرع الآن"}
        </button>

        {status && <div className="p-2 text-center bg-red-100 text-red-700 rounded">{status}</div>}
      </div>
    </div>
  );
}
