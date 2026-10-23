import '@testing-library/jest-dom'
import 'jest-axe/extend-expect'

// jsdom no expone structuredClone aunque Node lo tenga.
if (typeof globalThis.structuredClone === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { serialize, deserialize } = require('node:v8') as typeof import('node:v8')
  globalThis.structuredClone = <T,>(valor: T): T => deserialize(serialize(valor)) as T
}
