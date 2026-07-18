/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    {
      name: 'domain-has-no-outward-dependencies',
      severity: 'error',
      comment:
        'The domain package must not import any other Meridian package or app.',
      from: { path: '(^|/)packages/domain/' },
      to: {
        path: '(^|/)(apps/|packages/(?!domain/))',
      },
    },
    {
      name: 'application-does-not-import-adapters',
      severity: 'error',
      comment:
        'Application orchestration depends only on domain and its ports.',
      from: { path: '(^|/)packages/application/' },
      to: { path: '(^|/)(apps/|packages/(?!application/|domain/))' },
    },
    {
      name: 'presentation-does-not-import-adapters',
      severity: 'error',
      comment:
        'Web and worker call application services rather than adapters directly.',
      from: { path: '(^|/)apps/(web|worker)/(?!app/_server/composition\\.ts)' },
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
    exclude: { path: '(^|/)(node_modules|\\.next|\\.types|dist)/' },
    includeOnly: '(^|/)(apps|packages)/',
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
  },
};
