import type { Block } from '@blocknote/core';

/**
 * REQ-313: Frozen goldens captured with BlockNote 0.51.2 from COMPAT_FIXTURE_BLOCKS.
 *
 * COMPAT_GOLDEN_DOC is the normalized document BlockNote produces for that fixture.
 * COMPAT_GOLDEN_YJS_UPDATE_BASE64 is a Yjs update encoding the same document into the
 * 'document-store' XML fragment, i.e. the exact shape of the crdt_blob values already
 * stored in wiki_collab_states.
 *
 * These exist so a BlockNote upgrade cannot silently change the persisted document
 * format or break existing collaborative documents. Regenerate them only when the
 * change is understood and intentional.
 */
export const COMPAT_GOLDEN_DOC: Block<any, any, any>[] = [
    {
      "id": "fx-heading",
      "type": "heading",
      "props": {
        "backgroundColor": "default",
        "textColor": "default",
        "textAlignment": "left",
        "level": 2,
        "isToggleable": false
      },
      "content": [
        {
          "type": "text",
          "text": "Compat heading",
          "styles": {}
        }
      ],
      "children": []
    },
    {
      "id": "fx-paragraph",
      "type": "paragraph",
      "props": {
        "backgroundColor": "default",
        "textColor": "default",
        "textAlignment": "left"
      },
      "content": [
        {
          "type": "text",
          "text": "plain ",
          "styles": {}
        },
        {
          "type": "text",
          "text": "bold",
          "styles": {
            "bold": true
          }
        },
        {
          "type": "text",
          "text": " and ",
          "styles": {}
        },
        {
          "type": "text",
          "text": "italic",
          "styles": {
            "italic": true
          }
        },
        {
          "type": "text",
          "text": " and ",
          "styles": {}
        },
        {
          "type": "text",
          "text": "colored",
          "styles": {
            "textColor": "red"
          }
        }
      ],
      "children": []
    },
    {
      "id": "fx-code",
      "type": "codeBlock",
      "props": {
        "language": "typescript"
      },
      "content": [
        {
          "type": "text",
          "text": "const answer = 42;",
          "styles": {}
        }
      ],
      "children": []
    },
    {
      "id": "fx-bullet",
      "type": "bulletListItem",
      "props": {
        "backgroundColor": "default",
        "textColor": "default",
        "textAlignment": "left"
      },
      "content": [
        {
          "type": "text",
          "text": "outer bullet",
          "styles": {}
        }
      ],
      "children": [
        {
          "id": "fx-bullet-child",
          "type": "bulletListItem",
          "props": {
            "backgroundColor": "default",
            "textColor": "default",
            "textAlignment": "left"
          },
          "content": [
            {
              "type": "text",
              "text": "nested bullet",
              "styles": {}
            }
          ],
          "children": []
        }
      ]
    },
    {
      "id": "fx-check",
      "type": "checkListItem",
      "props": {
        "backgroundColor": "default",
        "textColor": "default",
        "textAlignment": "left",
        "checked": true
      },
      "content": [
        {
          "type": "text",
          "text": "done item",
          "styles": {}
        }
      ],
      "children": []
    },
    {
      "id": "fx-quote",
      "type": "quote",
      "props": {
        "backgroundColor": "default",
        "textColor": "default"
      },
      "content": [
        {
          "type": "text",
          "text": "quoted text",
          "styles": {}
        }
      ],
      "children": []
    },
    {
      "id": "fx-image",
      "type": "image",
      "props": {
        "textAlignment": "left",
        "backgroundColor": "default",
        "name": "",
        "url": "/api/projects/p1/entities/e1/attachments/a1",
        "caption": "shot",
        "showPreview": true
      },
      "children": []
    },
    {
      "id": "fx-table",
      "type": "table",
      "props": {
        "textColor": "default"
      },
      "content": {
        "type": "tableContent",
        "columnWidths": [
          null,
          null
        ],
        "rows": [
          {
            "cells": [
              {
                "type": "tableCell",
                "content": [
                  {
                    "type": "text",
                    "text": "r1c1",
                    "styles": {}
                  }
                ],
                "props": {
                  "colspan": 1,
                  "rowspan": 1,
                  "backgroundColor": "default",
                  "textColor": "default",
                  "textAlignment": "left"
                }
              },
              {
                "type": "tableCell",
                "content": [
                  {
                    "type": "text",
                    "text": "r1c2",
                    "styles": {}
                  }
                ],
                "props": {
                  "colspan": 1,
                  "rowspan": 1,
                  "backgroundColor": "default",
                  "textColor": "default",
                  "textAlignment": "left"
                }
              }
            ]
          },
          {
            "cells": [
              {
                "type": "tableCell",
                "content": [
                  {
                    "type": "text",
                    "text": "r2c1",
                    "styles": {}
                  }
                ],
                "props": {
                  "colspan": 1,
                  "rowspan": 1,
                  "backgroundColor": "default",
                  "textColor": "default",
                  "textAlignment": "left"
                }
              },
              {
                "type": "tableCell",
                "content": [
                  {
                    "type": "text",
                    "text": "r2c2",
                    "styles": {}
                  }
                ],
                "props": {
                  "colspan": 1,
                  "rowspan": 1,
                  "backgroundColor": "default",
                  "textColor": "default",
                  "textAlignment": "left"
                }
              }
            ]
          }
        ]
      },
      "children": []
    },
    {
      "id": "fx-inline-custom",
      "type": "paragraph",
      "props": {
        "backgroundColor": "default",
        "textColor": "default",
        "textAlignment": "left"
      },
      "content": [
        {
          "type": "text",
          "text": "see ",
          "styles": {}
        },
        {
          "type": "taskLink",
          "props": {
            "taskKey": "REQ-313"
          }
        },
        {
          "type": "text",
          "text": " with ",
          "styles": {}
        },
        {
          "type": "status",
          "props": {
            "id": "st-1",
            "text": "In Progress",
            "color": "blue"
          }
        }
      ],
      "children": []
    }
  ] as unknown as Block<any, any, any>[];

/** Yjs update produced by BlockNote 0.51.2 for COMPAT_GOLDEN_DOC, base64 encoded. */
export const COMPAT_GOLDEN_YJS_UPDATE_BASE64 =
  'AYkB7cHY0AgABwEOZG9jdW1lbnQtc3RvcmUDCmJsb2NrR3JvdXAHAO3B2NAIAAMOYmxvY2tDb250YWluZXIHAO3B2NAIAQMH' +
  'aGVhZGluZwcA7cHY0AgCBgQA7cHY0AgDDkNvbXBhdCBoZWFkaW5nKADtwdjQCAIPYmFja2dyb3VuZENvbG9yAXcHZGVmYXVs' +
  'dCgA7cHY0AgCCXRleHRDb2xvcgF3B2RlZmF1bHQoAO3B2NAIAg10ZXh0QWxpZ25tZW50AXcEbGVmdCgA7cHY0AgCBWxldmVs' +
  'AX0CKADtwdjQCAIMaXNUb2dnbGVhYmxlAXkoAO3B2NAIAQJpZAF3CmZ4LWhlYWRpbmeH7cHY0AgBAw5ibG9ja0NvbnRhaW5l' +
  'cgcA7cHY0AgYAwlwYXJhZ3JhcGgHAO3B2NAIGQYEAO3B2NAIGgZwbGFpbiCG7cHY0AggBGJvbGQCe32E7cHY0AghBGJvbGSG' +
  '7cHY0AglBGJvbGQEbnVsbITtwdjQCCYFIGFuZCCG7cHY0AgrBml0YWxpYwJ7fYTtwdjQCCwGaXRhbGljhu3B2NAIMgZpdGFs' +
  'aWMEbnVsbITtwdjQCDMFIGFuZCCG7cHY0Ag4CXRleHRDb2xvchV7InN0cmluZ1ZhbHVlIjoicmVkIn2E7cHY0Ag5B2NvbG9y' +
  'ZWSG7cHY0AhACXRleHRDb2xvcgRudWxsKADtwdjQCBkPYmFja2dyb3VuZENvbG9yAXcHZGVmYXVsdCgA7cHY0AgZCXRleHRD' +
  'b2xvcgF3B2RlZmF1bHQoAO3B2NAIGQ10ZXh0QWxpZ25tZW50AXcEbGVmdCgA7cHY0AgYAmlkAXcMZngtcGFyYWdyYXBoh+3B' +
  '2NAIGAMOYmxvY2tDb250YWluZXIHAO3B2NAIRgMJY29kZUJsb2NrBwDtwdjQCEcGBADtwdjQCEgSY29uc3QgYW5zd2VyID0g' +
  'NDI7KADtwdjQCEcIbGFuZ3VhZ2UBdwp0eXBlc2NyaXB0KADtwdjQCEYCaWQBdwdmeC1jb2Rlh+3B2NAIRgMOYmxvY2tDb250' +
  'YWluZXIHAO3B2NAIXQMOYnVsbGV0TGlzdEl0ZW0HAO3B2NAIXgYEAO3B2NAIXwxvdXRlciBidWxsZXQoAO3B2NAIXg9iYWNr' +
  'Z3JvdW5kQ29sb3IBdwdkZWZhdWx0KADtwdjQCF4JdGV4dENvbG9yAXcHZGVmYXVsdCgA7cHY0AheDXRleHRBbGlnbm1lbnQB' +
  'dwRsZWZ0h+3B2NAIXgMKYmxvY2tHcm91cAcA7cHY0AhvAw5ibG9ja0NvbnRhaW5lcgcA7cHY0AhwAw5idWxsZXRMaXN0SXRl' +
  'bQcA7cHY0AhxBgQA7cHY0AhyDW5lc3RlZCBidWxsZXQoAO3B2NAIcQ9iYWNrZ3JvdW5kQ29sb3IBdwdkZWZhdWx0KADtwdjQ' +
  'CHEJdGV4dENvbG9yAXcHZGVmYXVsdCgA7cHY0AhxDXRleHRBbGlnbm1lbnQBdwRsZWZ0KADtwdjQCHACaWQBdw9meC1idWxs' +
  'ZXQtY2hpbGQoAO3B2NAIXQJpZAF3CWZ4LWJ1bGxldIftwdjQCF0DDmJsb2NrQ29udGFpbmVyBwDtwdjQCIUBAw1jaGVja0xp' +
  'c3RJdGVtBwDtwdjQCIYBBgQA7cHY0AiHAQlkb25lIGl0ZW0oAO3B2NAIhgEPYmFja2dyb3VuZENvbG9yAXcHZGVmYXVsdCgA' +
  '7cHY0AiGAQl0ZXh0Q29sb3IBdwdkZWZhdWx0KADtwdjQCIYBDXRleHRBbGlnbm1lbnQBdwRsZWZ0KADtwdjQCIYBB2NoZWNr' +
  'ZWQBeCgA7cHY0AiFAQJpZAF3CGZ4LWNoZWNrh+3B2NAIhQEDDmJsb2NrQ29udGFpbmVyBwDtwdjQCJYBAwVxdW90ZQcA7cHY' +
  '0AiXAQYEAO3B2NAImAELcXVvdGVkIHRleHQoAO3B2NAIlwEPYmFja2dyb3VuZENvbG9yAXcHZGVmYXVsdCgA7cHY0AiXAQl0' +
  'ZXh0Q29sb3IBdwdkZWZhdWx0KADtwdjQCJYBAmlkAXcIZngtcXVvdGWH7cHY0AiWAQMOYmxvY2tDb250YWluZXIHAO3B2NAI' +
  'pwEDBWltYWdlKADtwdjQCKgBDXRleHRBbGlnbm1lbnQBdwRsZWZ0KADtwdjQCKgBD2JhY2tncm91bmRDb2xvcgF3B2RlZmF1' +
  'bHQoAO3B2NAIqAEEbmFtZQF3ACgA7cHY0AioAQN1cmwBdysvYXBpL3Byb2plY3RzL3AxL2VudGl0aWVzL2UxL2F0dGFjaG1l' +
  'bnRzL2ExKADtwdjQCKgBB2NhcHRpb24BdwRzaG90KADtwdjQCKgBC3Nob3dQcmV2aWV3AXgoAO3B2NAIqAEMcHJldmlld1dp' +
  'ZHRoAX8oAO3B2NAIpwECaWQBdwhmeC1pbWFnZYftwdjQCKcBAw5ibG9ja0NvbnRhaW5lcgcA7cHY0AixAQMFdGFibGUHAO3B' +
  '2NAIsgEDCHRhYmxlUm93BwDtwdjQCLMBAwl0YWJsZUNlbGwHAO3B2NAItAEDDnRhYmxlUGFyYWdyYXBoBwDtwdjQCLUBBgQA' +
  '7cHY0Ai2AQRyMWMxKADtwdjQCLQBCXRleHRDb2xvcgF3B2RlZmF1bHQoAO3B2NAItAEPYmFja2dyb3VuZENvbG9yAXcHZGVm' +
  'YXVsdCgA7cHY0Ai0AQ10ZXh0QWxpZ25tZW50AXcEbGVmdCgA7cHY0Ai0AQdjb2xzcGFuAX0BKADtwdjQCLQBB3Jvd3NwYW4B' +
  'fQGH7cHY0Ai0AQMJdGFibGVDZWxsBwDtwdjQCMABAw50YWJsZVBhcmFncmFwaAcA7cHY0AjBAQYEAO3B2NAIwgEEcjFjMigA' +
  '7cHY0AjAAQl0ZXh0Q29sb3IBdwdkZWZhdWx0KADtwdjQCMABD2JhY2tncm91bmRDb2xvcgF3B2RlZmF1bHQoAO3B2NAIwAEN' +
  'dGV4dEFsaWdubWVudAF3BGxlZnQoAO3B2NAIwAEHY29sc3BhbgF9ASgA7cHY0AjAAQdyb3dzcGFuAX0Bh+3B2NAIswEDCHRh' +
  'YmxlUm93BwDtwdjQCMwBAwl0YWJsZUNlbGwHAO3B2NAIzQEDDnRhYmxlUGFyYWdyYXBoBwDtwdjQCM4BBgQA7cHY0AjPAQRy' +
  'MmMxKADtwdjQCM0BCXRleHRDb2xvcgF3B2RlZmF1bHQoAO3B2NAIzQEPYmFja2dyb3VuZENvbG9yAXcHZGVmYXVsdCgA7cHY' +
  '0AjNAQ10ZXh0QWxpZ25tZW50AXcEbGVmdCgA7cHY0AjNAQdjb2xzcGFuAX0BKADtwdjQCM0BB3Jvd3NwYW4BfQGH7cHY0AjN' +
  'AQMJdGFibGVDZWxsBwDtwdjQCNkBAw50YWJsZVBhcmFncmFwaAcA7cHY0AjaAQYEAO3B2NAI2wEEcjJjMigA7cHY0AjZAQl0' +
  'ZXh0Q29sb3IBdwdkZWZhdWx0KADtwdjQCNkBD2JhY2tncm91bmRDb2xvcgF3B2RlZmF1bHQoAO3B2NAI2QENdGV4dEFsaWdu' +
  'bWVudAF3BGxlZnQoAO3B2NAI2QEHY29sc3BhbgF9ASgA7cHY0AjZAQdyb3dzcGFuAX0BKADtwdjQCLIBCXRleHRDb2xvcgF3' +
  'B2RlZmF1bHQoAO3B2NAIsQECaWQBdwhmeC10YWJsZYftwdjQCLEBAw5ibG9ja0NvbnRhaW5lcgcA7cHY0AjnAQMJcGFyYWdy' +
  'YXBoBwDtwdjQCOgBBgQA7cHY0AjpAQRzZWUgh+3B2NAI6QEDCHRhc2tMaW5rKADtwdjQCO4BB3Rhc2tLZXkBdwdSRVEtMzEz' +
  'h+3B2NAI7gEGBADtwdjQCPABBiB3aXRoIIftwdjQCPABAwZzdGF0dXMoAO3B2NAI9wECaWQBdwRzdC0xKADtwdjQCPcBBHRl' +
  'eHQBdwtJbiBQcm9ncmVzcygA7cHY0Aj3AQVjb2xvcgF3BGJsdWUoAO3B2NAI6AEPYmFja2dyb3VuZENvbG9yAXcHZGVmYXVs' +
  'dCgA7cHY0AjoAQl0ZXh0Q29sb3IBdwdkZWZhdWx0KADtwdjQCOgBDXRleHRBbGlnbm1lbnQBdwRsZWZ0KADtwdjQCOcBAmlk' +
  'AXcQZngtaW5saW5lLWN1c3RvbQA=';
