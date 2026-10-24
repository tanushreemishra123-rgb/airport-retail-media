import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./styles.css";
import { useStore } from "./store";
import { Shell } from "./Shell";
import { Admin } from "./roles/Admin";
import { Retailer } from "./roles/Retailer";
import { MediaManager } from "./roles/MediaManager";
import { Airline } from "./roles/Airline";
import { Passenger } from "./roles/Passenger";
import { Demo } from "./roles/Demo";
import { Claim } from "./Claim";

function App() {
  const init = useStore((s) => s.init);
  useEffect(() => { void init(); }, [init]);
  return (
    <Routes>
      {/* Mobile claim page: standalone, no shell. */}
      <Route path="/claim/:code" element={<Claim />} />
      <Route path="/*" element={<Shell><Inner /></Shell>} />
    </Routes>
  );
}

function Inner() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin" replace />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/retailer" element={<Retailer />} />
      <Route path="/media" element={<MediaManager />} />
      <Route path="/airline" element={<Airline />} />
      <Route path="/passenger" element={<Passenger />} />
      <Route path="/demo" element={<Demo />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}

createRoot(document.getElementById("root")!).render(
  <BrowserRouter><App /></BrowserRouter>,
);
