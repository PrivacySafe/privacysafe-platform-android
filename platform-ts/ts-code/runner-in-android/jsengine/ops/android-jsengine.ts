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

const startJSEngineComponentFn = wrapFnOnAndroidSide('js_startComponent');
interface ComponentEntrypointArgs { connectorId: string; appDomain: string; entrypoint: string; }
const componentEntrypointArgsType = ProtoType.for<ComponentEntrypointArgs>(pb.ComponentEntrypointArgs);

export async function startJSEngineComponent(
  connectorId: string, appDomain: string, entrypoint: string
): Promise<void> {
  await startJSEngineComponentFn(componentEntrypointArgsType.pack({ connectorId, appDomain, entrypoint }));
}

