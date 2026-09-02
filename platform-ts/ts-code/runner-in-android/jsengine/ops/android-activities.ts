/*
 Copyright (C) 2026 3NSoft Inc.
 
 This program is free software: you can redistribute it and/or modify it under
 the terms of the GNU General Public License as published by the Free Software
 Foundation, either version 3 of the License, or (at your option) any later
 version.
 
 This program is distributed in the hope that it will be useful, but
 WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 See the GNU General Public License for more details.
 
 You should have received a copy of the GNU General Public License along with
 this program. If not, see <http://www.gnu.org/licenses/>.
*/

import { wrapFnOnAndroidSide } from "../runtime-ipc-via-ports";
import { components as pb } from "../../protos/components.proto";
import { ProtoType } from "../../../platform/lib-common/protobuf-msg";

const startAndroidActivityFn = wrapFnOnAndroidSide('ui_startAppActivity');
interface ComponentEntrypointArgs { connectorId: string; appDomain: string; entrypoint: string; }
const componentEntrypointArgsType = ProtoType.for<ComponentEntrypointArgs>(pb.ComponentEntrypointArgs);

export async function startAndroidActivity(
  connectorId: string, appDomain: string, entrypoint: string
): Promise<void> {
  await startAndroidActivityFn(componentEntrypointArgsType.pack({ connectorId, appDomain, entrypoint }));
}

const closeAndroidActivityFn = wrapFnOnAndroidSide('ui_closeAppActivity');
interface ConnectorIdArgs { connectorId: string; }
const connectorIdArgsType = ProtoType.for<ConnectorIdArgs>(pb.ConnectorIdArgs);

export async function closeAndroidActivity(connectorId: string): Promise<void> {
  await closeAndroidActivityFn(connectorIdArgsType.pack({ connectorId }));
}

const focusAndroidActivityFn = wrapFnOnAndroidSide('ui_focusAppActivity');

export async function focusAndroidActivity(connectorId: string): Promise<void> {
  await focusAndroidActivityFn(connectorIdArgsType.pack({ connectorId }));
}

const exitAllFn = wrapFnOnAndroidSide('ui_exitAll');

export function exitAll(): void {
  exitAllFn();
}

const showSystemErrorBoxFn = wrapFnOnAndroidSide('ui_showSystemErrorBox');
interface SystemErrBoxArgs { title: string, content: string }
const systemErrBoxArgsType = ProtoType.for<SystemErrBoxArgs>(pb.SystemErrBoxArgs);

export function showSystemErrorBox(title: string, content: string): void {
  showSystemErrorBoxFn(systemErrBoxArgsType.pack({ title, content }));
}
