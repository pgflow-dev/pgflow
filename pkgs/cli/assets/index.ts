import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { compileFlow } from "@pgflow/dsl";

serve(async (req) => {
  // Only handle POST requests to /compile
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  console.log("url.pathname", url.pathname);
  if (url.pathname !== "/pgflow/compile") {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const requestData = await req.json();
    console.log("Request to compile flow: ", requestData);

    if (!requestData.path || typeof requestData.path !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'path' parameter" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Import the flow file
    console.log("Importing flow module...", requestData.path);
    try {
      const flowModule = await import("./wide.ts");
      console.log("Imported flowModule: ", flowModule);

      // Check if there's a default export
      if (!flowModule.default) {
        return new Response(
          JSON.stringify({
            error: `No default export found in ${requestData.path}`,
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Compile the flow
      const flow = flowModule.default;
      console.log("flow", flow);
      const compiledSQL = compileFlow(flow);

      // Return the compiled SQL as a string
      return new Response(
        JSON.stringify({ compiledFlow: compiledSQL.join("\n") }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error("Error details:", error);
      return new Response(
        JSON.stringify({
          error: `Error compiling flow: ${error.message}`,
          stack: error.stack,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  } catch (error) {
    console.error("Error details:", error);
    return new Response(
      JSON.stringify({
        error: `Error compiling flow: ${error.message}`,
        stack: error.stack,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});
