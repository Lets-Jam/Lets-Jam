import React, { useMemo, useState } from "react";
import MainPage from "./pages/MainPage";
import DevPage from "./pages/DevPage";
import JamPage from "./pages/JamPage";
import { useJamSession } from "./hooks/useJamSession";

export default function App() {
  const jamSession = useJamSession();
  const [page, setPage] = useState("main");

  const handleGoToDevPage = () => {
    setPage("dev");
  };

  const handleGoToMainPage = () => {
    setPage("main");
  };

  const currentPage = useMemo(() => {
    if (page === "dev") return "dev";
    if (jamSession.inRoom) return "jam";
    return "main";
  }, [jamSession.inRoom, page]);

  if (currentPage === "dev") {
    return <DevPage onGoBack={handleGoToMainPage} />;
  }

  if (currentPage === "jam") {
    return <JamPage session={jamSession} onLeave={jamSession.resetSession} />;
  }

  return <MainPage session={jamSession} onGoToDevPage={handleGoToDevPage} />;
}
