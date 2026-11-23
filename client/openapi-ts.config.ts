import { defineConfig } from '@hey-api/openapi-ts'

export default defineConfig({
  input: '../contract/generated/openapi.yaml',
  output: 'src/api/generated',
})
