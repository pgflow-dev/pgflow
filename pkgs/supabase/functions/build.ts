// import * as esbuild from "https://deno.land/x/esbuild@v0.20.2/mod.js";
import * as esbuild from "npm:esbuild@0.20.2";
// import { denoPlugins } from "https://deno.land/x/esbuild_deno_loader@0.6.0/mod.ts";
import { denoPlugins } from "jsr:@luca/esbuild-deno-loader@^0.11.0";

await esbuild.build({
  entryPoints: ["./functions/_flows/Basic.ts"], // Your entry file
  bundle: true,
  format: "esm",
  outfile: "./functions/_compiled-flows/Basic.js", // Output file
  plugins: [...denoPlugins()],
  treeShaking: true,
  minify: false,
});

esbuild.stop();
