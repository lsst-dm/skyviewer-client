"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type FC,
  type PropsWithChildren,
} from "react";

/**
 * The origin to build shareable absolute URLs from — share links, embed
 * snippets, anything the user copies out of the app.
 *
 * It cannot come from the environment the way the server's `BASE_URL` does:
 * a client component only sees NEXT_PUBLIC_ values, and those are substituted
 * in when the image is built, which is exactly what stops one image serving
 * more than one host.
 *
 * So the server seeds it — correct at request time, and the only thing
 * prerendered HTML can carry — and the browser replaces it on mount with the
 * origin it actually used. A viewer on a host the image was not built for
 * therefore still copies working links. Updating in an effect rather than
 * during render keeps the first paint identical to the server's, so there is
 * nothing for React to report as a hydration mismatch.
 */
const BaseUrlContext = createContext<string>("");

interface BaseUrlProviderProps {
  /** the server's `BASE_URL` */
  value: string;
}

export const BaseUrlProvider: FC<PropsWithChildren<BaseUrlProviderProps>> = ({
  value,
  children,
}) => {
  const [baseUrl, setBaseUrl] = useState(value);

  useEffect(() => {
    setBaseUrl(window.location.origin);
  }, []);

  return (
    <BaseUrlContext.Provider value={baseUrl}>
      {children}
    </BaseUrlContext.Provider>
  );
};

BaseUrlProvider.displayName = "BaseUrl.Provider";

export const useBaseUrl = (): string => useContext(BaseUrlContext);

export default BaseUrlContext;
