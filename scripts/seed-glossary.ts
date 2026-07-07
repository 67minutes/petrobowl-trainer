import { seedGlossary } from "@/lib/import/glossary-import";

async function main() {
  const result = await seedGlossary();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
