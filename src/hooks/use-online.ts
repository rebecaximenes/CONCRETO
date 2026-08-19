import * as React from "react";

/**
 * Estado da conexao. A frente de obra tem internet instavel, entao toda tela
 * de campo precisa saber se esta online para avisar o tecnico.
 */
export function useOnline() {
  const [online, setOnline] = React.useState(() => navigator.onLine);

  React.useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}
