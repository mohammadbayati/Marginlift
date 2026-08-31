import { renderToStaticMarkup } from "react-dom/server";
import { PublicSite } from "../public";

export function renderPublic(pathname: string) {
  return renderToStaticMarkup(<PublicSite pathname={pathname} />);
}
