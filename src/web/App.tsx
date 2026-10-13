import { useEffect, useState } from "react";
import { isRoomCode } from "../shared/protocol";
import { Home } from "./Home";
import { Room } from "./Room";

/** Two pages: home at "/", a game at "/r/CODE". */
export function App() {
  const [path, setPath] = useState(location.pathname);

  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  const go = (to: string) => {
    history.pushState(null, "", to);
    setPath(to);
  };

  const match = /^\/r\/([A-Za-z]+)\/?$/.exec(path);
  const code = match?.[1]?.toUpperCase();
  if (code && isRoomCode(code)) return <Room code={code} onHome={() => go("/")} />;
  return <Home onOpenGame={(c) => go(`/r/${c}`)} />;
}
