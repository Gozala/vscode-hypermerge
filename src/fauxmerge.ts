import * as vscode from "vscode";

import { Hypermerge, FrontendManager } from "hypermerge";
const { keyPair } = require("hypercore/lib/crypto");
const raf = require("random-access-file");
import DiscoveryCloud from "./discovery-cloud/client";
import { EventEmitter } from "events";
import { rejects } from "assert";

interface HypermergeNodeDetails {
  docId: string;
  keyPath: string[];
}

export function interpretHypermergeUri(uri: vscode.Uri): HypermergeNodeDetails {
  const docId = uri.authority;
  const keyPath = uri.path
    .split("/")
    .slice(1)
    .filter(Boolean);
  return { docId, keyPath };
}

export class HypermergeWrapper extends EventEmitter {
  hypermerge = new Hypermerge({ storage: raf });

  constructor() {
    super();

    const stream = this.hypermerge.stream;
    const id = Buffer.from("vscode-extension");
    const url = "wss://discovery-cloud.herokuapp.com";

    const hyperswarmwrapper = new DiscoveryCloud({ stream, id, url });
    this.hypermerge.joinSwarm(hyperswarmwrapper);
  }

  docHandles = new Map<string, FrontendManager<any>>();

  resolveSubDocument(doc: any, keyPath): any {
    let content = doc;
    let key;
    while ((key = keyPath.shift())) {
      content = content[key];
    }
    return content;
  }

  openDocumentUri(uri: vscode.Uri): Promise<any> {
    return new Promise((resolve, reject) => {
      const { docId, keyPath } = interpretHypermergeUri(uri);

      let docFrontend = this.docHandles.get(docId);
      if (!docFrontend) {
        docFrontend = this.hypermerge.openDocumentFrontend(docId);
        this.docHandles.set(docId, docFrontend);
        docFrontend.on("doc", (doc: any) => {
          this.emit("update", uri);
        });
      }

      /*
      let timeOut = setTimeout(() => {
        reject(null);
      }, 5000);
      */

      docFrontend.handle().once((doc: any) => {
        //clearTimeout(timeOut);
        let subDoc = this.resolveSubDocument(doc, keyPath);
        resolve(subDoc);
      });
    });
  }

  setDocumentUri(uri: vscode.Uri, newDoc: any) {
    const { docId, keyPath } = interpretHypermergeUri(uri);

    let docFrontend = this.docHandles.get(docId);
    if (!docFrontend) {
      docFrontend = this.hypermerge.openDocumentFrontend(docId);
      this.docHandles.set(docId, docFrontend);
    }

    docFrontend.change(doc => {
      let content = doc;
      let key;
      while ((key = keyPath.shift())) {
        // special case to assign leaf values :(
        // this needs more consideration
        if (!(content[key] instanceof Object) && keyPath.length === 0) {
          if (typeof content[key] === "string") {
            content[key] = newDoc;
          } else {
            content[key] = newDoc;
          }
          return;
        }
        content = content[key];
      }
      Object.keys(newDoc).forEach(key => {
        content[key] = newDoc[key];
      });
    });
  }
}
