import { Routes, Route } from 'react-router-dom';
import DonateForm from './pages/Donate';
import OtpConfirmationPage from './pages/OtpConfirmationPage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<DonateForm />} />
      <Route path="/confirm" element={<OtpConfirmationPage />} />
    </Routes>
  );
}

export default App;
