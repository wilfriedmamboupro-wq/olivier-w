import { Link, Route, Routes } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import NewRfp from "./pages/NewRfp";
import RfpDetail from "./pages/RfpDetail";

export default function App() {
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <header className="app-header">
        <div className="app-header__inner">
          <Link to="/" className="brand">
            <span className="brand__mark">Lanebook</span>
            <span className="brand__tagline">RFP Automation</span>
          </Link>
        </div>
      </header>
      <main id="main-content" className="app-main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/new" element={<NewRfp />} />
          <Route path="/rfps/:rfpId" element={<RfpDetail />} />
        </Routes>
      </main>
    </div>
  );
}
