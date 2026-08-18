import { seedEnergyGlossaries } from "@/lib/import/energy-glossaries";

async function main() {
  const result = await seedEnergyGlossaries();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
