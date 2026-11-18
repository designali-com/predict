/**
 * The biomarker catalogue — reference data only (which markers exist, their
 * healthy ranges, the health domains and the biological-age indexes). No
 * patient data. Exported from the platform so the demo scores like the real one.
 */
export const BIOMARKER_CATALOG = {
 "biomarkers": [
  {
   "id": "7c8b8a3e-0a76-4856-965b-1dd4cf40e3bb",
   "name": "Aldolase A",
   "short_code": "Aldolase A",
   "description": "",
   "unit": "U/L",
   "range_min": 1.2,
   "range_max": 7.5,
   "direction": true,
   "price_in_paise": 60000
  },
  {
   "id": "b8fd1d1f-daa4-4b17-9d45-875c7c410084",
   "name": "Blood Urea Nitrogen",
   "short_code": "BUN",
   "description": "",
   "unit": "mg/dL",
   "range_min": 7,
   "range_max": 20,
   "direction": true,
   "price_in_paise": 25000
  },
  {
   "id": "9a8829dd-0a00-4b90-b35f-119e51a53644",
   "name": "Brain-Derived Neurotrophic Factor",
   "short_code": "BDNF",
   "description": "",
   "unit": "ng/mL",
   "range_min": 15,
   "range_max": 40,
   "direction": false,
   "price_in_paise": 200000
  },
  {
   "id": "75f251cd-b411-4622-b65b-54749b40546f",
   "name": "C-Terminal Telopeptide of Type II Collagen",
   "short_code": "CTX-II",
   "description": "",
   "unit": "pg/mL",
   "range_min": 120,
   "range_max": 450,
   "direction": true,
   "price_in_paise": 500000
  },
  {
   "id": "fced63bf-a29b-44ea-9a9a-4f54e5845dcd",
   "name": "Calcium-to-Phosphorus Ratio",
   "short_code": "Ca/P Ratio",
   "description": "",
   "unit": "Ratio",
   "range_min": 2,
   "range_max": 2.8,
   "direction": true,
   "price_in_paise": 25000
  },
  {
   "id": "e11a0fd7-f1c9-48ac-9ab5-40cd084045fd",
   "name": "Cartilage Oligomeric Matrix Protein",
   "short_code": "COMP",
   "description": "",
   "unit": "ng/mL",
   "range_min": 200,
   "range_max": 600,
   "direction": true,
   "price_in_paise": 200000
  },
  {
   "id": "db8667da-8b91-4e18-b3b1-2bc6910f2f18",
   "name": "Creatine Kinase-M Muscle Type (CK-MM)",
   "short_code": "CK-MM",
   "description": "",
   "unit": "U/L",
   "range_min": 50,
   "range_max": 170,
   "direction": true,
   "price_in_paise": 150000
  },
  {
   "id": "3bf5e0e3-0230-4e7f-9810-c8728ec66e06",
   "name": "Creatinine",
   "short_code": "Creatinine",
   "description": "",
   "unit": "mg/dL",
   "range_min": 0.7,
   "range_max": 1.3,
   "direction": true,
   "price_in_paise": 25000
  },
  {
   "id": "297b07f7-ddc0-4128-b643-3db5d88940fe",
   "name": "Estimated Glomerular Filtration Rate",
   "short_code": "eGFR",
   "description": "",
   "unit": "mL/min/1.73 m²",
   "range_min": 60,
   "range_max": 120,
   "direction": false,
   "price_in_paise": 60000
  },
  {
   "id": "edf6f2fb-0c76-494d-a249-ee65e65e482a",
   "name": "Hemoglobin A1c (Glycated Hemoglobin)",
   "short_code": "HbA1c",
   "description": "",
   "unit": "%",
   "range_min": 4,
   "range_max": 5.6,
   "direction": true,
   "price_in_paise": 60000
  },
  {
   "id": "e0e00bc2-4e24-406b-a321-0572a6ae785d",
   "name": "High-Density Lipoprotein Cholesterol",
   "short_code": "HDL-C",
   "description": "",
   "unit": "mg/dL",
   "range_min": 40,
   "range_max": 80,
   "direction": false,
   "price_in_paise": 25000
  },
  {
   "id": "dad1e5ce-859d-440b-ac4b-73547bd3f29d",
   "name": "High-Sensitivity C-Reactive Protein",
   "short_code": "hs-CRP",
   "description": "",
   "unit": "mg/L",
   "range_min": 0.2,
   "range_max": 3,
   "direction": true,
   "price_in_paise": 60000
  },
  {
   "id": "ab24aa1e-98b5-4c84-a76e-36131637a107",
   "name": "Insulin-like Growth Factor 1",
   "short_code": "IGF-1",
   "description": null,
   "unit": "ng/mL",
   "range_min": 90,
   "range_max": 360,
   "direction": false,
   "price_in_paise": 200000
  },
  {
   "id": "2d33af43-ab20-424d-8ba3-327db9cdd235",
   "name": "Interleukin-6",
   "short_code": "IL-6",
   "description": "",
   "unit": "pg/mL",
   "range_min": 0.5,
   "range_max": 7,
   "direction": true,
   "price_in_paise": 150000
  },
  {
   "id": "426d9680-9d8c-4285-baef-aa3fb9afe4f2",
   "name": "Low-Density Lipoprotein Cholesterol",
   "short_code": "LDL-C",
   "description": "",
   "unit": "mg/dL",
   "range_min": 50,
   "range_max": 99,
   "direction": true,
   "price_in_paise": 25000
  },
  {
   "id": "b392c664-1bc5-469b-9ee8-bfdecf7042fe",
   "name": "Malondialdehyde",
   "short_code": "MDA",
   "description": "",
   "unit": "µmol/L",
   "range_min": 1,
   "range_max": 3.5,
   "direction": true,
   "price_in_paise": 150000
  },
  {
   "id": "964bdece-766b-48d2-9f59-6443da00f68c",
   "name": "Matrix Metalloproteinase-9",
   "short_code": "MMP-9",
   "description": "",
   "unit": "ng/mL",
   "range_min": 20,
   "range_max": 140,
   "direction": true,
   "price_in_paise": 200000
  },
  {
   "id": "b89e94cf-92ff-4039-a4eb-52513157f017",
   "name": "Myostatin",
   "short_code": "Myostatin",
   "description": null,
   "unit": "ng/mL",
   "range_min": 2,
   "range_max": 12,
   "direction": true,
   "price_in_paise": 500000
  },
  {
   "id": "e64a2d79-7d52-4cb2-acdc-934897c8f605",
   "name": "Neutrophil-to-Lymphocyte Ratio",
   "short_code": "NLR",
   "description": "",
   "unit": "Ratio",
   "range_min": 1,
   "range_max": 3,
   "direction": true,
   "price_in_paise": 25000
  },
  {
   "id": "bfb520e5-25f7-4966-a31c-e135b2f144b0",
   "name": "Nitric Oxide (Total Nitrite/Nitrate)",
   "short_code": "NOx",
   "description": null,
   "unit": "µmol/L",
   "range_min": 20,
   "range_max": 60,
   "direction": false,
   "price_in_paise": 150000
  },
  {
   "id": "55ee2e12-659a-44d9-a6ef-1de1a6ab3786",
   "name": "Osteocalcin (Bone γ-Carboxyglutamic Acid Protein)",
   "short_code": "Osteocalcin",
   "description": "",
   "unit": "ng/mL",
   "range_min": 11,
   "range_max": 43,
   "direction": false,
   "price_in_paise": 150000
  },
  {
   "id": "da264dec-2bf9-4651-9cf9-0aeaf3617b5f",
   "name": "Parathyroid Hormone",
   "short_code": "PTH",
   "description": "",
   "unit": "pg/mL",
   "range_min": 15,
   "range_max": 65,
   "direction": true,
   "price_in_paise": 60000
  },
  {
   "id": "0c8fadf9-f09e-4b26-994c-d5d884ec8e6e",
   "name": "Procollagen Type I N-Terminal Propeptide",
   "short_code": "PINP",
   "description": null,
   "unit": "ng/mL",
   "range_min": 20,
   "range_max": 80,
   "direction": false,
   "price_in_paise": 150000
  },
  {
   "id": "33083c00-258b-4b6f-8d81-9fc199cd6c86",
   "name": "Substance P",
   "short_code": "Substance P",
   "description": "",
   "unit": "pg/mL",
   "range_min": 30,
   "range_max": 200,
   "direction": true,
   "price_in_paise": 500000
  },
  {
   "id": "bb8abd1d-a881-4024-a370-261388989bae",
   "name": "Total Cholesterol",
   "short_code": "TC",
   "description": "",
   "unit": "mg/dL",
   "range_min": 120,
   "range_max": 199,
   "direction": true,
   "price_in_paise": 25000
  },
  {
   "id": "751487c4-ddcb-4b50-b005-614612a1fb2b",
   "name": "Transforming Growth Factor-Beta 1",
   "short_code": "TGF-β1",
   "description": "",
   "unit": "pg/mL",
   "range_min": 10,
   "range_max": 40,
   "direction": true,
   "price_in_paise": 200000
  },
  {
   "id": "80e9e046-9c40-4dbe-aefa-3e328fcd8754",
   "name": "Triglycerides",
   "short_code": "TG",
   "description": "",
   "unit": "mg/dL",
   "range_min": 50,
   "range_max": 149,
   "direction": true,
   "price_in_paise": 25000
  },
  {
   "id": "3be9a244-1a75-499d-8ecc-ee041c5faeeb",
   "name": "Vascular Endothelial Growth Factor",
   "short_code": "VEGF",
   "description": "",
   "unit": "pg/mL",
   "range_min": 30,
   "range_max": 250,
   "direction": true,
   "price_in_paise": 200000
  },
  {
   "id": "957b0fca-85b2-4b59-a523-0794f0a5fcb1",
   "name": "Vitamin D (commonly measured as 25-Hydroxyvitamin D)",
   "short_code": "Vitamin D",
   "description": "",
   "unit": "ng/mL",
   "range_min": 30,
   "range_max": 100,
   "direction": false,
   "price_in_paise": 60000
  }
 ],
 "domains": [
  {
   "id": "e77a4e59-5e8c-44bd-a327-94a2c0d83a38",
   "name": "Bone Metabolic Function (BMF)",
   "short_code": "BMF",
   "description": ""
  },
  {
   "id": "ce5ef453-4442-4857-a3b2-f272108c3078",
   "name": "Cardiometabolic Function (CMF)",
   "short_code": "CMF",
   "description": ""
  },
  {
   "id": "68961a05-f232-4a95-8bb2-eb1fb8bc65de",
   "name": "Cardiometabolic Risk (CMR)",
   "short_code": "CMR",
   "description": null
  },
  {
   "id": "4d9f5489-4aeb-4ea1-ac5f-3274f3d20139",
   "name": "Inflammation Risk Factor (IFR)",
   "short_code": "IFR",
   "description": ""
  },
  {
   "id": "5d581cb0-be6a-4bd2-802f-a44254baff62",
   "name": "Inflammatory Risk (IR)",
   "short_code": "IR",
   "description": null
  },
  {
   "id": "70e69e04-fff6-463c-b8a4-5f39db83a59e",
   "name": "Musculoskeletal & Connective Decline Risk (MCDR)",
   "short_code": "MCDR",
   "description": null
  },
  {
   "id": "21b35755-f445-4eec-a12e-5b45649aa734",
   "name": "Musculoskeletal Health Factotor (MHF)",
   "short_code": "MHF",
   "description": ""
  },
  {
   "id": "f5650ed7-dd86-4c4b-85ea-125581dd9d36",
   "name": "Neuro-Vascular Function Risk (NVFR)",
   "short_code": "NVFR",
   "description": null
  },
  {
   "id": "8b8cdcd3-ffcb-4253-8771-846a0d97023c",
   "name": "Perepheral Nerve Function (PNF)",
   "short_code": "PNF",
   "description": ""
  },
  {
   "id": "9b14dda6-3682-4da6-90e9-a536268ea4fc",
   "name": "Renal Filtration Factor (RFF)",
   "short_code": "RFF",
   "description": ""
  },
  {
   "id": "194a7553-746c-4a24-a36e-35db0657991e",
   "name": "Vascular & Anggiogenic Function (VAF)",
   "short_code": "VAF",
   "description": ""
  }
 ],
 "indexes": [
  {
   "id": "5965401d-d3aa-4090-87a1-39dc8f263443",
   "name": "Composite Biological Musculoskeletal Index  (CBMI)",
   "short_code": "CBMI",
   "description": "",
   "k": 1,
   "risk_bands": []
  },
  {
   "id": "15c55ce6-b03d-4fdc-a5a5-cfbb1cb5182d",
   "name": "Composite Biological OrthoAge  Index (CBOAI)",
   "short_code": "CBOAI",
   "description": "",
   "k": 1,
   "risk_bands": []
  },
  {
   "id": "138349eb-029a-405d-996c-fcad8344dc7b",
   "name": "Composite Biological Neurofunction Index (CBNI)",
   "short_code": "CBNI",
   "description": "",
   "k": 1,
   "risk_bands": []
  },
  {
   "id": "a23843ae-2b11-488f-a9f2-32a57a2fdfe6",
   "name": "Composite Biological LegAge  Index (CBLAI):",
   "short_code": "CBLAI",
   "description": "",
   "k": 1,
   "risk_bands": []
  },
  {
   "id": "8efd53ab-0597-44da-88d9-22f4a8208449",
   "name": "Composite Biological Venous Aging Index (CBVAI):",
   "short_code": "CBVAI",
   "description": "",
   "k": 1,
   "risk_bands": []
  }
 ],
 "indexDomains": [
  {
   "index_id": "5965401d-d3aa-4090-87a1-39dc8f263443",
   "domain_id": "e77a4e59-5e8c-44bd-a327-94a2c0d83a38",
   "risk_bands": []
  },
  {
   "index_id": "5965401d-d3aa-4090-87a1-39dc8f263443",
   "domain_id": "5d581cb0-be6a-4bd2-802f-a44254baff62",
   "risk_bands": []
  },
  {
   "index_id": "5965401d-d3aa-4090-87a1-39dc8f263443",
   "domain_id": "70e69e04-fff6-463c-b8a4-5f39db83a59e",
   "risk_bands": []
  },
  {
   "index_id": "5965401d-d3aa-4090-87a1-39dc8f263443",
   "domain_id": "68961a05-f232-4a95-8bb2-eb1fb8bc65de",
   "risk_bands": []
  },
  {
   "index_id": "5965401d-d3aa-4090-87a1-39dc8f263443",
   "domain_id": "f5650ed7-dd86-4c4b-85ea-125581dd9d36",
   "risk_bands": []
  },
  {
   "index_id": "a23843ae-2b11-488f-a9f2-32a57a2fdfe6",
   "domain_id": "9b14dda6-3682-4da6-90e9-a536268ea4fc",
   "risk_bands": []
  },
  {
   "index_id": "a23843ae-2b11-488f-a9f2-32a57a2fdfe6",
   "domain_id": "ce5ef453-4442-4857-a3b2-f272108c3078",
   "risk_bands": []
  },
  {
   "index_id": "a23843ae-2b11-488f-a9f2-32a57a2fdfe6",
   "domain_id": "8b8cdcd3-ffcb-4253-8771-846a0d97023c",
   "risk_bands": []
  },
  {
   "index_id": "a23843ae-2b11-488f-a9f2-32a57a2fdfe6",
   "domain_id": "e77a4e59-5e8c-44bd-a327-94a2c0d83a38",
   "risk_bands": []
  },
  {
   "index_id": "a23843ae-2b11-488f-a9f2-32a57a2fdfe6",
   "domain_id": "21b35755-f445-4eec-a12e-5b45649aa734",
   "risk_bands": []
  },
  {
   "index_id": "a23843ae-2b11-488f-a9f2-32a57a2fdfe6",
   "domain_id": "4d9f5489-4aeb-4ea1-ac5f-3274f3d20139",
   "risk_bands": []
  },
  {
   "index_id": "a23843ae-2b11-488f-a9f2-32a57a2fdfe6",
   "domain_id": "194a7553-746c-4a24-a36e-35db0657991e",
   "risk_bands": []
  }
 ],
 "domainBiomarkers": [
  {
   "domain_id": "4d9f5489-4aeb-4ea1-ac5f-3274f3d20139",
   "biomarker_id": "dad1e5ce-859d-440b-ac4b-73547bd3f29d"
  },
  {
   "domain_id": "4d9f5489-4aeb-4ea1-ac5f-3274f3d20139",
   "biomarker_id": "e64a2d79-7d52-4cb2-acdc-934897c8f605"
  },
  {
   "domain_id": "4d9f5489-4aeb-4ea1-ac5f-3274f3d20139",
   "biomarker_id": "b392c664-1bc5-469b-9ee8-bfdecf7042fe"
  },
  {
   "domain_id": "4d9f5489-4aeb-4ea1-ac5f-3274f3d20139",
   "biomarker_id": "2d33af43-ab20-424d-8ba3-327db9cdd235"
  },
  {
   "domain_id": "194a7553-746c-4a24-a36e-35db0657991e",
   "biomarker_id": "3be9a244-1a75-499d-8ecc-ee041c5faeeb"
  },
  {
   "domain_id": "194a7553-746c-4a24-a36e-35db0657991e",
   "biomarker_id": "964bdece-766b-48d2-9f59-6443da00f68c"
  },
  {
   "domain_id": "194a7553-746c-4a24-a36e-35db0657991e",
   "biomarker_id": "751487c4-ddcb-4b50-b005-614612a1fb2b"
  },
  {
   "domain_id": "21b35755-f445-4eec-a12e-5b45649aa734",
   "biomarker_id": "e11a0fd7-f1c9-48ac-9ab5-40cd084045fd"
  },
  {
   "domain_id": "21b35755-f445-4eec-a12e-5b45649aa734",
   "biomarker_id": "db8667da-8b91-4e18-b3b1-2bc6910f2f18"
  },
  {
   "domain_id": "21b35755-f445-4eec-a12e-5b45649aa734",
   "biomarker_id": "7c8b8a3e-0a76-4856-965b-1dd4cf40e3bb"
  },
  {
   "domain_id": "21b35755-f445-4eec-a12e-5b45649aa734",
   "biomarker_id": "75f251cd-b411-4622-b65b-54749b40546f"
  },
  {
   "domain_id": "e77a4e59-5e8c-44bd-a327-94a2c0d83a38",
   "biomarker_id": "fced63bf-a29b-44ea-9a9a-4f54e5845dcd"
  },
  {
   "domain_id": "e77a4e59-5e8c-44bd-a327-94a2c0d83a38",
   "biomarker_id": "da264dec-2bf9-4651-9cf9-0aeaf3617b5f"
  },
  {
   "domain_id": "e77a4e59-5e8c-44bd-a327-94a2c0d83a38",
   "biomarker_id": "957b0fca-85b2-4b59-a523-0794f0a5fcb1"
  },
  {
   "domain_id": "e77a4e59-5e8c-44bd-a327-94a2c0d83a38",
   "biomarker_id": "55ee2e12-659a-44d9-a6ef-1de1a6ab3786"
  },
  {
   "domain_id": "8b8cdcd3-ffcb-4253-8771-846a0d97023c",
   "biomarker_id": "9a8829dd-0a00-4b90-b35f-119e51a53644"
  },
  {
   "domain_id": "8b8cdcd3-ffcb-4253-8771-846a0d97023c",
   "biomarker_id": "33083c00-258b-4b6f-8d81-9fc199cd6c86"
  },
  {
   "domain_id": "ce5ef453-4442-4857-a3b2-f272108c3078",
   "biomarker_id": "edf6f2fb-0c76-494d-a249-ee65e65e482a"
  },
  {
   "domain_id": "ce5ef453-4442-4857-a3b2-f272108c3078",
   "biomarker_id": "bb8abd1d-a881-4024-a370-261388989bae"
  },
  {
   "domain_id": "ce5ef453-4442-4857-a3b2-f272108c3078",
   "biomarker_id": "e0e00bc2-4e24-406b-a321-0572a6ae785d"
  },
  {
   "domain_id": "ce5ef453-4442-4857-a3b2-f272108c3078",
   "biomarker_id": "426d9680-9d8c-4285-baef-aa3fb9afe4f2"
  },
  {
   "domain_id": "ce5ef453-4442-4857-a3b2-f272108c3078",
   "biomarker_id": "80e9e046-9c40-4dbe-aefa-3e328fcd8754"
  },
  {
   "domain_id": "9b14dda6-3682-4da6-90e9-a536268ea4fc",
   "biomarker_id": "297b07f7-ddc0-4128-b643-3db5d88940fe"
  },
  {
   "domain_id": "9b14dda6-3682-4da6-90e9-a536268ea4fc",
   "biomarker_id": "b8fd1d1f-daa4-4b17-9d45-875c7c410084"
  },
  {
   "domain_id": "9b14dda6-3682-4da6-90e9-a536268ea4fc",
   "biomarker_id": "3bf5e0e3-0230-4e7f-9810-c8728ec66e06"
  },
  {
   "domain_id": "21b35755-f445-4eec-a12e-5b45649aa734",
   "biomarker_id": "ab24aa1e-98b5-4c84-a76e-36131637a107"
  },
  {
   "domain_id": "21b35755-f445-4eec-a12e-5b45649aa734",
   "biomarker_id": "b89e94cf-92ff-4039-a4eb-52513157f017"
  },
  {
   "domain_id": "e77a4e59-5e8c-44bd-a327-94a2c0d83a38",
   "biomarker_id": "0c8fadf9-f09e-4b26-994c-d5d884ec8e6e"
  },
  {
   "domain_id": "194a7553-746c-4a24-a36e-35db0657991e",
   "biomarker_id": "bfb520e5-25f7-4966-a31c-e135b2f144b0"
  },
  {
   "domain_id": "5d581cb0-be6a-4bd2-802f-a44254baff62",
   "biomarker_id": "dad1e5ce-859d-440b-ac4b-73547bd3f29d"
  },
  {
   "domain_id": "5d581cb0-be6a-4bd2-802f-a44254baff62",
   "biomarker_id": "e64a2d79-7d52-4cb2-acdc-934897c8f605"
  },
  {
   "domain_id": "5d581cb0-be6a-4bd2-802f-a44254baff62",
   "biomarker_id": "2d33af43-ab20-424d-8ba3-327db9cdd235"
  },
  {
   "domain_id": "70e69e04-fff6-463c-b8a4-5f39db83a59e",
   "biomarker_id": "db8667da-8b91-4e18-b3b1-2bc6910f2f18"
  },
  {
   "domain_id": "70e69e04-fff6-463c-b8a4-5f39db83a59e",
   "biomarker_id": "7c8b8a3e-0a76-4856-965b-1dd4cf40e3bb"
  },
  {
   "domain_id": "70e69e04-fff6-463c-b8a4-5f39db83a59e",
   "biomarker_id": "ab24aa1e-98b5-4c84-a76e-36131637a107"
  },
  {
   "domain_id": "70e69e04-fff6-463c-b8a4-5f39db83a59e",
   "biomarker_id": "b89e94cf-92ff-4039-a4eb-52513157f017"
  },
  {
   "domain_id": "70e69e04-fff6-463c-b8a4-5f39db83a59e",
   "biomarker_id": "75f251cd-b411-4622-b65b-54749b40546f"
  },
  {
   "domain_id": "68961a05-f232-4a95-8bb2-eb1fb8bc65de",
   "biomarker_id": "edf6f2fb-0c76-494d-a249-ee65e65e482a"
  },
  {
   "domain_id": "68961a05-f232-4a95-8bb2-eb1fb8bc65de",
   "biomarker_id": "bb8abd1d-a881-4024-a370-261388989bae"
  },
  {
   "domain_id": "68961a05-f232-4a95-8bb2-eb1fb8bc65de",
   "biomarker_id": "426d9680-9d8c-4285-baef-aa3fb9afe4f2"
  },
  {
   "domain_id": "68961a05-f232-4a95-8bb2-eb1fb8bc65de",
   "biomarker_id": "e0e00bc2-4e24-406b-a321-0572a6ae785d"
  },
  {
   "domain_id": "f5650ed7-dd86-4c4b-85ea-125581dd9d36",
   "biomarker_id": "9a8829dd-0a00-4b90-b35f-119e51a53644"
  },
  {
   "domain_id": "f5650ed7-dd86-4c4b-85ea-125581dd9d36",
   "biomarker_id": "3be9a244-1a75-499d-8ecc-ee041c5faeeb"
  },
  {
   "domain_id": "f5650ed7-dd86-4c4b-85ea-125581dd9d36",
   "biomarker_id": "bfb520e5-25f7-4966-a31c-e135b2f144b0"
  }
 ]
} as const;
