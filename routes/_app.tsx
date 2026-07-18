import { define } from "../utils.ts";

export default define.page(function App({ Component }) {
  return (
    <html lang="en" data-theme="system">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#11181c" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body>
        <a class="skip-link" href="#workspace-main">Skip to review workspace</a>
        <Component />
      </body>
    </html>
  );
});
