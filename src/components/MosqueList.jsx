
import { useState, useEffect } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

function MosqueList() {
  const [mosques, setMosques] = useState([]);
useEffect(() => {
  const fetchMosques = async () => {
    const querySnapshot = await getDocs(collection(db, "mosques"));
    const mosquesData = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    console.log("📡 استدعاء البيانات من Firestore...");
    console.log("✅ عدد المساجد:", mosquesData.length);
    console.log("📝 البيانات:", mosquesData);

    setMosques(mosquesData);
  };

  fetchMosques();
}, []);
  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">قائمة المساجد</h2>
      <ul className="space-y-2">
        {mosques.map((mosque) => (
          <li key={mosque.id} className="border p-2 rounded">
            {mosque.name || "بدون اسم"}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default MosqueList;
