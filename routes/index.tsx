import { Head } from "fresh/runtime";
import ReviewWorkspace from "../islands/ReviewWorkspace.tsx";
import { SAMPLE_DIFF } from "../lib/sample.ts";
import { define } from "../utils.ts";

export default define.page(function Home() {
  return (
    <>
      <Head>
        <title>Patchscope — review the change, not the noise</title>
        <meta
          name="description"
          content="A local-first workspace for reviewing patches and public GitHub changes in a deliberate order."
        />
      </Head>
      <ReviewWorkspace sampleDiff={SAMPLE_DIFF} />
    </>
  );
});
