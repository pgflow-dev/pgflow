import { Flow } from '@pgflow/dsl';

type Input = {
  logo_url: string;
  company_slug: string;
  company_id: string;
};

// Dummy async task that simulates real async work
async function processCompanyLogoTask(input: { logo_url: string; company_slug: string }) {
  // Simulate some async work with a promise
  await new Promise((resolve) => setTimeout(resolve, 100));
  return {
    file_path: `/uploads/${input.company_slug}/logo.png`,
  };
}

// Another dummy async task
async function updateCompanyLogoUrlTask(input: { company_id: string; file_path: string }) {
  // Simulate some async work
  await new Promise((resolve) => setTimeout(resolve, 50));
  return {
    success: true,
    company_id: input.company_id,
    logo_url: input.file_path,
  };
}

export default new Flow<Input>({
  slug: 'upload_company_logo',
  maxAttempts: 3,
  timeout: 60,
  baseDelay: 2,
})
  .step(
    { slug: 'process_company_logo' },
    async (input) => await processCompanyLogoTask({
      logo_url: input.run.logo_url,
      company_slug: input.run.company_slug,
    })
  )
  .step(
    { slug: 'update_company_logo_url', dependsOn: ['process_company_logo'] },
    async (input) => await updateCompanyLogoUrlTask({
      company_id: input.run.company_id,
      file_path: (input.process_company_logo as { file_path: string }).file_path,
    })
  );
