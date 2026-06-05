-- CSVインポート UPSERT の onConflict: 'company_name' に必要な UNIQUE 制約
ALTER TABLE companies ADD CONSTRAINT companies_company_name_unique UNIQUE (company_name);
