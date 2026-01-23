import { Route, Routes } from "react-router-dom";
import Shell from "./components/Shell";
import Checker from "./pages/Checker";
import Landing from "./pages/Landing";
import Lease from "./pages/Lease";
import Privacy from "./pages/Privacy";
import Report from "./pages/Report";
import Safety from "./pages/Safety";
import Terms from "./pages/Terms";

// ✅ pages
import Extension from "./pages/Extension";
import Import from "./pages/Import";

// ✅ more pages
import Emergency from "./pages/Emergency";
import NotFound from "./pages/NotFound";
import SimilarListings from "./pages/SimilarListings";

export default function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/checker" element={<Checker />} />
        <Route path="/lease" element={<Lease />} />
        <Route path="/report" element={<Report />} />
        {/* ❌ Removed: Reputation page route */}
        {/* <Route path="/reputation" element={<Reputation />} /> */}
        <Route path="/safety" element={<Safety />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />

        {/* ✅ must match Shell link: /similar-listings */}
        <Route path="/similar-listings" element={<SimilarListings />} />

        <Route path="/emergency" element={<Emergency />} />
        <Route path="/import" element={<Import />} />
        <Route path="/extension" element={<Extension />} />

        {/* Fallback */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Shell>
  );
}
