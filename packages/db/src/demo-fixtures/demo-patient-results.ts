/**
 * The demo patient's biological age, as the platform's own calculation gave it
 * for the readings in ../demo-patient.ts. Filled by running
 * apps/clinic/src/lib/biological-age/run-calculation once against the demo
 * database; null until then (the dashboard then shows readings, no score).
 */
export interface DemoResult {
  indexId: string;
  chronologicalAge: number;
  compositeScore: number;
  deltaAge: number;
  biologicalAge: number;
  domains: { domainId: string; meanAbsZ: number; biomarkerCount: number; weightUsed: number; alphaUsed: number; contribution: number }[];
}

export const DEMO_PATIENT_RESULTS: DemoResult[] | null = [
  {
    "indexId": "a23843ae-2b11-488f-a9f2-32a57a2fdfe6",
    "chronologicalAge": 45,
    "compositeScore": 1.7130778716756905,
    "deltaAge": 8.889022444041167,
    "biologicalAge": 53.88902244404117,
    "domains": [
      {
        "domainId": "9b14dda6-3682-4da6-90e9-a536268ea4fc",
        "meanAbsZ": 2.1511111111111108,
        "biomarkerCount": 3,
        "weightUsed": 0.23301879006300033,
        "alphaUsed": 6,
        "contribution": 3.007495850413124
      },
      {
        "domainId": "ce5ef453-4442-4857-a3b2-f272108c3078",
        "meanAbsZ": 0.849,
        "biomarkerCount": 5,
        "weightUsed": 0.09196779828881126,
        "alphaUsed": 2,
        "contribution": 0.1561613214944015
      },
      {
        "domainId": "8b8cdcd3-ffcb-4253-8771-846a0d97023c",
        "meanAbsZ": 0.39999999999999986,
        "biomarkerCount": 2,
        "weightUsed": 0.04332994030097113,
        "alphaUsed": 1,
        "contribution": 0.017331976120388445
      },
      {
        "domainId": "e77a4e59-5e8c-44bd-a327-94a2c0d83a38",
        "meanAbsZ": 1.954,
        "biomarkerCount": 5,
        "weightUsed": 0.21166675837024404,
        "alphaUsed": 5,
        "contribution": 2.0679842292772843
      },
      {
        "domainId": "21b35755-f445-4eec-a12e-5b45649aa734",
        "meanAbsZ": 0.5066666666666666,
        "biomarkerCount": 6,
        "weightUsed": 0.05488459104789678,
        "alphaUsed": 1,
        "contribution": 0.027808192797601033
      },
      {
        "domainId": "4d9f5489-4aeb-4ea1-ac5f-3274f3d20139",
        "meanAbsZ": 1.1607142857142856,
        "biomarkerCount": 4,
        "weightUsed": 0.1257342017662109,
        "alphaUsed": 3,
        "contribution": 0.43782445257877
      },
      {
        "domainId": "194a7553-746c-4a24-a36e-35db0657991e",
        "meanAbsZ": 2.21,
        "biomarkerCount": 4,
        "weightUsed": 0.23939792016286557,
        "alphaUsed": 6,
        "contribution": 3.1744164213595973
      }
    ]
  }
];
