const fs = require('node:fs')
const path = require('node:path')
const dotenv = require('dotenv')

dotenv.config({ path: path.resolve(__dirname, '../.env') })

const templatePath = path.resolve(__dirname, './env.template.ts')
const outputPath = path.resolve(__dirname, '../src/generated-env.ts')

// Read the template
let template = fs.readFileSync(templatePath, 'utf-8')

// Replace the placeholder without logging or exposing other environment values.
template = template.replace("'%%DWELLIR_KEY%%'", JSON.stringify(process.env.DWELLIR_KEY ?? ''))

// Write the result
fs.writeFileSync(outputPath, template)

console.log('✅ Env written to src/generated-env.ts')
