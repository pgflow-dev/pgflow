import ts, { TypeChecker, Symbol as TsSymbol, Type } from "ts-morph";
import { JSONSchema7 } from "json-schema";

export function typeToJsonSchemaSingle(
  type: ts.Type,
  typeChecker: TypeChecker,
): JSONSchema7 {
  if (type.isString()) {
    return { type: "string" };
  }
  if (type.isNumber()) {
    return { type: "number" };
  }
  if (type.isBoolean()) {
    return { type: "boolean" };
  }
  if (type.isStringLiteral()) {
    const value = type.getLiteralValue() as string;
    return { type: "string", enum: [value] };
  }
  if (type.isNumberLiteral()) {
    const value = type.getLiteralValue() as number;
    return { type: "number", enum: [value] };
  }
  if (type.isBooleanLiteral()) {
    const value = type.getLiteralValue() as unknown as boolean;
    return { type: "boolean", enum: [value] };
  }
  if (type.isNull() || type.isUndefined()) {
    return { type: "null" };
  }
  if (type.isArray()) {
    return {
      type: "array",
      items: type.getArrayElementType()
        ? typeToJsonSchema([type.getArrayElementType()!], typeChecker)
        : {},
    };
  }
  if (type.isUnion()) {
    const types = type.getUnionTypes();
    return {
      anyOf: types.map((t) => typeToJsonSchemaSingle(t, typeChecker)),
    };
  }
  if (type.isIntersection()) {
    const types = type.getIntersectionTypes();
    return {
      allOf: types.map((t) => typeToJsonSchemaSingle(t, typeChecker)),
    };
  }
  if (type.isObject() && type.getSymbol()) {
    const properties: { [key: string]: JSONSchema7 } = {};

    const excludedProperties = new Set([
      "then",
      "catch",
      "finally",
      "__@toStringTag",
    ]);

    type.getProperties().forEach((property: TsSymbol) => {
      const propName = property.getName();
      if (excludedProperties.has(propName)) {
        return; // Skip Promise methods
      }
      const declarations = property.getDeclarations();
      if (declarations.length === 0) {
        return; // Skip if no declarations
      }
      const propertyType = typeChecker.getTypeOfSymbolAtLocation(
        property,
        declarations[0],
      );
      properties[propName] = typeToJsonSchema([propertyType], typeChecker);
    });
    return {
      type: "object",
      properties,
    };
  }
  return {};
}

function stableStringify(obj: any): string {
  if (obj !== null && typeof obj === "object") {
    if (Array.isArray(obj)) {
      return `[${obj.map(stableStringify).join(",")}]`;
    } else {
      const keys = Object.keys(obj).sort();
      return `{${keys
        .map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k]))
        .join(",")}}`;
    }
  } else {
    return JSON.stringify(obj);
  }
}

function deduplicateSchemas(schemas: JSONSchema7[]): JSONSchema7[] {
  const seen = new Set<string>();
  const uniqueSchemas: JSONSchema7[] = [];

  for (const schema of schemas) {
    const json = stableStringify(schema);
    if (!seen.has(json)) {
      seen.add(json);
      uniqueSchemas.push(schema);
    }
  }
  return uniqueSchemas;
}

// Updated typeToJsonSchema function
export default function typeToJsonSchema(
  types: ts.Type[],
  typeChecker: TypeChecker,
): JSONSchema7 {
  if (types.length === 1) {
    return typeToJsonSchemaSingle(types[0], typeChecker);
  } else {
    const schemas = types.map((type) =>
      typeToJsonSchemaSingle(type, typeChecker),
    );
    const uniqueSchemas = deduplicateSchemas(schemas);

    if (uniqueSchemas.length === 1) {
      return uniqueSchemas[0];
    } else {
      return {
        anyOf: uniqueSchemas,
      };
    }
  }
}
