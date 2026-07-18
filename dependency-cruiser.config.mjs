/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    {
      name: 'domain-has-no-outward-dependencies',
      severity: 'error',
      comment:
        'The domain package must not import application or infrastructure.',
      from: { path: '(^|/)packages/domain/' },
      to: {
        path: '(^|/)packages/(application|infrastructure-[^/]+)/',
      },
    },
    {
      name: 'application-does-not-import-adapters',
      severity: 'error',
      comment:
        'Application orchestration depends on domain ports, never adapters.',
      from: { path: '(^|/)packages/application/' },
      to: { path: '(^|/)packages/infrastructure-[^/]+/' },
    },
    {
      name: 'presentation-does-not-import-adapters',
      severity: 'error',
      comment:
        'Web and worker call application services rather than adapters directly.',
      from: { path: '(^|/)apps/(web|worker)/' },
      to: { path: '(^|/)packages/infrastructure-[^/]+/' },
    },
    {
      name: 'domain-does-not-import-prompts',
      severity: 'error',
      comment:
        'Prompt schemas may import domain; domain never imports prompts.',
      from: { path: '(^|/)packages/domain/' },
      to: { path: '(^|/)packages/prompts/' },
    },
    {
      name: 'no-circular-dependencies',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: 'node_modules' },
    includeOnly: '(^|/)(apps|packages)/',
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
  },
};
