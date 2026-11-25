import { Template, defaultBuildLogger } from 'e2b'
const t = Template({ fileContextPath: './ctx' }).fromDockerfile('./ctx/Dockerfile')
await Template.build(t, { alias: 'omnimuse-drama', cpuCount: 4, memoryMB: 8192, onBuildLogs: defaultBuildLogger() })
console.log('BUILD DONE')
