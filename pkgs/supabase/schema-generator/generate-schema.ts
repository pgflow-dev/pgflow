import { Project, Type } from "ts-morph";
import typeToJsonSchema from "./typeToJsonSchema.ts";
import { JSONSchema7 } from "json-schema";

// Initialize a Project
const project = new Project({
  tsConfigFilePath: "schema-generator/tsconfig.json",
});

function isPromiseType(type: Type): boolean {
  return type.getSymbol()?.getName() === "Promise";
}

// Updated unwrapPromiseType function
function unwrapPromiseType(type: Type): Type[] {
  const types: Type[] = [];
  const visited = new Set<string>();

  function helper(t: Type) {
    const typeId = t.getText();
    if (visited.has(typeId)) {
      return;
    }
    visited.add(typeId);

    if (isPromiseType(t)) {
      const typeArguments = t.getTypeArguments();
      if (typeArguments.length > 0) {
        helper(typeArguments[0]);
      }
    } else if (t.isUnion()) {
      t.getUnionTypes().forEach(helper);
    } else {
      types.push(t);
    }
  }

  helper(type);
  return types;
}

function analyzeFlow(sourceFilePath: string) {
  const sourceFile = project.getSourceFileOrThrow(sourceFilePath);
  const typeChecker = project.getTypeChecker();

  const stepsToSchemas: { [key: string]: JSONSchema7 } = {};

  try {
    // Find the type alias 'StepsType'
    const stepsTypeAlias = sourceFile.getTypeAliasOrThrow("StepsType");
    const stepsType = stepsTypeAlias.getType();

    // Get the properties of StepsType, which represent the steps
    const stepDefsProperties = stepsType.getProperties();

    for (const stepDefProp of stepDefsProperties) {
      const stepName = stepDefProp.getName();
      // console.log(`Processing step: ${stepName}`);

      // Get the type of the step definition
      const stepDefType = stepDefProp.getTypeAtLocation(stepsTypeAlias);

      // Access the 'handler' property of the step definition
      const handlerSymbol = stepDefType.getProperty("handler");
      if (!handlerSymbol) {
        console.error(`Handler property not found for step ${stepName}.`);
        continue;
      }

      const handlerDeclarations = handlerSymbol.getDeclarations();
      if (handlerDeclarations.length === 0) {
        console.error(`No declarations found for handler in step ${stepName}.`);
        continue;
      }
      const handlerType = typeChecker.getTypeOfSymbolAtLocation(
        handlerSymbol,
        handlerDeclarations[0],
      );

      // Get the call signatures of the handler function
      const callSignatures = handlerType.getCallSignatures();
      if (callSignatures.length === 0) {
        console.error(
          `No call signatures found for handler in step ${stepName}.`,
        );
        continue;
      }

      // Get the return type of the handler function
      const returnType = callSignatures[0].getReturnType();
      const unwrappedReturnType = unwrapPromiseType(returnType);

      // Convert the unwrapped return type to JSON Schema
      const schema = typeToJsonSchema(unwrappedReturnType, typeChecker);
      stepsToSchemas[stepName] = schema;
      // console.log(
      //   `JSON Schema for step "${stepName}":`,
      //   JSON.stringify(schema, null, 2),
      // );
    }
  } catch (error) {
    console.error("Failed to analyze flow:", error);
  }

  return stepsToSchemas;
}

const stepsToSchemas = analyzeFlow("functions/_flows/HatchetFlow.ts");

console.log(JSON.stringify(stepsToSchemas, null, 2));
