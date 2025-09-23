import path from "path";
import type { Plugin } from "vite";
import ts from "typescript";

function prefixClasses(classString: string, prefix: string): string {
  return classString
    .split(/\s+/)
    .filter((cls) => cls.trim())
    .map((cls) => {
      // Don't prefix arbitrary values
      if (cls.startsWith("[") && cls.endsWith("]")) {
        return cls;
      }
      // Don't prefix CSS custom properties
      if (cls.startsWith("--")) {
        return cls;
      }
      // Don't prefix if already has the prefix
      if (cls.startsWith(prefix)) {
        return cls;
      }
      return `${prefix}${cls}`;
    })
    .join(" ");
}

function isClassNameProperty(node: ts.Node): boolean {
  return (
    ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === "className"
  );
}

function isCnOrCvaCall(node: ts.Node): boolean {
  if (!ts.isCallExpression(node)) return false;

  const expression = node.expression;
  if (ts.isIdentifier(expression)) {
    return expression.text === "cn" || expression.text === "cva";
  }
  return false;
}

function isInConditionalContext(node: ts.StringLiteral): boolean {
  let parent = node.parent;

  // Walk up to find if we're in a conditional expression or binary expression
  while (parent && !ts.isSourceFile(parent)) {
    // Check if parent is a conditional expression
    if (ts.isConditionalExpression(parent)) {
      // String is the condition (before ?)
      if (parent.condition === node || isAncestor(parent.condition, node)) {
        return true;
      }
    }

    // Check if parent is a binary expression with comparison operators
    if (ts.isBinaryExpression(parent)) {
      const op = parent.operatorToken.kind;
      if (
        op === ts.SyntaxKind.EqualsEqualsToken ||
        op === ts.SyntaxKind.EqualsEqualsEqualsToken ||
        op === ts.SyntaxKind.ExclamationEqualsToken ||
        op === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
        op === ts.SyntaxKind.LessThanToken ||
        op === ts.SyntaxKind.GreaterThanToken ||
        op === ts.SyntaxKind.LessThanEqualsToken ||
        op === ts.SyntaxKind.GreaterThanEqualsToken ||
        op === ts.SyntaxKind.AmpersandAmpersandToken
      ) {
        // For && operator, only skip the left side
        if (op === ts.SyntaxKind.AmpersandAmpersandToken) {
          if (parent.left === node || isAncestor(parent.left, node)) {
            return true;
          }
        } else {
          // For comparison operators, skip both sides
          return true;
        }
      }
    }

    parent = parent.parent;
  }

  return false;
}

function isAncestor(ancestor: ts.Node, descendant: ts.Node): boolean {
  let current = descendant.parent;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

function prefixTailwindClasses(sourceCode: string, prefix: string): string {
  const sourceFile = ts.createSourceFile(
    "temp.tsx",
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
    return (rootNode) => {
      function visit(node: ts.Node): ts.Node {
        // Case 1: className property assignment
        if (isClassNameProperty(node)) {
          const propAssignment = node as ts.PropertyAssignment;
          if (ts.isStringLiteral(propAssignment.initializer)) {
            const newText = prefixClasses(propAssignment.initializer.text, prefix);
            return ts.factory.updatePropertyAssignment(
              propAssignment,
              propAssignment.name,
              ts.factory.createStringLiteral(newText),
            );
          }
        }

        // Case 2 & 3: cn() or cva() function calls
        if (isCnOrCvaCall(node)) {
          const callExpr = node as ts.CallExpression;
          const newArgs = callExpr.arguments.map((arg) => {
            if (ts.isStringLiteral(arg) && !isInConditionalContext(arg)) {
              return ts.factory.createStringLiteral(prefixClasses(arg.text, prefix));
            }
            // Handle object literals in cva (for variants)
            if (ts.isObjectLiteralExpression(arg)) {
              return visitObjectLiteral(arg);
            }
            // Handle conditional expressions
            if (ts.isConditionalExpression(arg)) {
              return visitConditionalExpression(arg);
            }
            return arg;
          });

          return ts.factory.updateCallExpression(
            callExpr,
            callExpr.expression,
            callExpr.typeArguments,
            newArgs,
          );
        }

        return ts.visitEachChild(node, visit, context);
      }

      function visitObjectLiteral(
        obj: ts.ObjectLiteralExpression,
        isVariantDefinition = false,
      ): ts.ObjectLiteralExpression {
        const properties = obj.properties.map((prop) => {
          if (ts.isPropertyAssignment(prop)) {
            const propName = ts.isIdentifier(prop.name) ? prop.name.text : "";

            // Skip defaultVariants and compoundVariants - they contain variant names, not classes
            if (propName === "defaultVariants" || propName === "compoundVariants") {
              return prop;
            }

            // If we're in variants object, the next level defines variant options
            if (propName === "variants" && ts.isObjectLiteralExpression(prop.initializer)) {
              return ts.factory.updatePropertyAssignment(
                prop,
                prop.name,
                visitObjectLiteral(prop.initializer, true),
              );
            }

            // Inside variant definitions, only transform the values (class names), not the keys
            if (isVariantDefinition && ts.isObjectLiteralExpression(prop.initializer)) {
              const variantOptions = prop.initializer.properties.map((optionProp) => {
                if (
                  ts.isPropertyAssignment(optionProp) &&
                  ts.isStringLiteral(optionProp.initializer)
                ) {
                  // This is where the actual class names are
                  return ts.factory.updatePropertyAssignment(
                    optionProp,
                    optionProp.name,
                    ts.factory.createStringLiteral(
                      prefixClasses(optionProp.initializer.text, prefix),
                    ),
                  );
                }
                return optionProp;
              });

              return ts.factory.updatePropertyAssignment(
                prop,
                prop.name,
                ts.factory.updateObjectLiteralExpression(prop.initializer, variantOptions),
              );
            }

            // Default case - prefix string literals
            if (ts.isStringLiteral(prop.initializer)) {
              return ts.factory.updatePropertyAssignment(
                prop,
                prop.name,
                ts.factory.createStringLiteral(prefixClasses(prop.initializer.text, prefix)),
              );
            }

            // Handle nested objects
            if (ts.isObjectLiteralExpression(prop.initializer)) {
              return ts.factory.updatePropertyAssignment(
                prop,
                prop.name,
                visitObjectLiteral(prop.initializer),
              );
            }
          }
          return prop;
        });

        return ts.factory.updateObjectLiteralExpression(obj, properties);
      }

      function visitConditionalExpression(
        cond: ts.ConditionalExpression,
      ): ts.ConditionalExpression {
        const whenTrue = ts.isStringLiteral(cond.whenTrue)
          ? ts.factory.createStringLiteral(prefixClasses(cond.whenTrue.text, prefix))
          : cond.whenTrue;

        const whenFalse = ts.isStringLiteral(cond.whenFalse)
          ? ts.factory.createStringLiteral(prefixClasses(cond.whenFalse.text, prefix))
          : cond.whenFalse;

        return ts.factory.updateConditionalExpression(
          cond,
          cond.condition,
          cond.questionToken,
          whenTrue,
          cond.colonToken,
          whenFalse,
        );
      }

      return ts.visitNode(rootNode, visit) as ts.SourceFile;
    };
  };

  const result = ts.transform(sourceFile, [transformer]);
  const printer = ts.createPrinter();
  const transformed = printer.printFile(result.transformed[0]);
  result.dispose();

  return transformed;
}

interface ClassRenamingOptions {
  prefix: string;
  include?: string[];
  exclude?: string[];
}

export function tailwindPrefixer(options: ClassRenamingOptions): Plugin {
  const { prefix, include = ["**/*.tsx"], exclude = [] } = options;

  function shouldProcess(id: string): boolean {
    if (id.includes("node_modules")) {
      return false;
    }
    const relativePath = path.relative(process.cwd(), id);

    // Check include patterns
    const isIncluded = include.some((pattern) =>
      relativePath.includes(pattern.replace("**/", "").replace("*", "")),
    );

    // Check exclude patterns
    const isExcluded = exclude.some((pattern) =>
      relativePath.includes(pattern.replace("**/", "").replace("*", "")),
    );

    return isIncluded && !isExcluded && id.endsWith(".tsx");
  }

  return {
    name: "class-renaming",
    transform(code, id) {
      if (!shouldProcess(id)) {
        return null;
      }

      const transformedCode = prefixTailwindClasses(code, prefix);

      if (transformedCode !== code) {
        return {
          code: transformedCode,
          map: null, // You might want to generate source maps
        };
      }

      return null;
    },
  };
}
