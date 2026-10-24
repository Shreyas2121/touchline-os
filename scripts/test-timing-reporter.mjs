import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { performance } from 'node:perf_hooks'

// Optional reporter for repeatable environment comparisons:
// TOUCHLINE_TEST_METRICS=test-results/run.json pnpm test
//   --reporter=default --reporter=./scripts/test-timing-reporter.mjs
export default class TestTimingReporter {
  started = performance.now()

  onTestRunEnd(modules, errors, reason) {
    const files = modules.map((module) => {
      const timing = module.diagnostic()
      return {
        path: module.relativeModuleId,
        project: module.project.name,
        environmentMs: timing.environmentSetupDuration,
        setupMs: timing.setupDuration,
        tests: [...module.children.allTests()].map((test) => ({
          name: test.fullName,
          state: test.result().state,
        })),
      }
    })
    const output = {
      reason,
      unhandledErrors: errors.length,
      reporterWallMs: performance.now() - this.started,
      environmentMs: files.reduce((sum, file) => sum + file.environmentMs, 0),
      setupMs: files.reduce((sum, file) => sum + file.setupMs, 0),
      files,
    }
    const target =
      process.env.TOUCHLINE_TEST_METRICS ?? 'test-results/test-timing.json'
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, `${JSON.stringify(output, null, 2)}\n`)
  }
}
