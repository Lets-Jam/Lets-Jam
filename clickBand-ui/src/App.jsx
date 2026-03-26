import React, { useState } from "react";
import MainPage from "./pages/MainPage";
import DevPage from "./pages/DevPage";
import JamPage from "./pages/JamPage";

export default function App() {
  const [page, setPage] = useState("main");

  const handleGoToDevPage = () => {
    setPage("dev");
  };

  const handleGoToMainPage = () => {
    setPage("main");
  };

  const handleGoToJamPage = () => {
    setPage("jam");
  };

  if (page === "dev") {
    return <DevPage onGoBack={handleGoToMainPage} />;
  }

  if (page === "jam") {
    return <JamPage onLeave={handleGoToMainPage} />;
  }

  return <MainPage onGoToDevPage={handleGoToDevPage} onGoToJamPage={handleGoToJamPage} />;
}
