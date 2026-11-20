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

import { makeMountException, DirectoryNode, NodeWithFS, NodeWithFile, sanitizePath, sep, TreeNode } from './mount-tree';

type FS = web3n.files.FS;
type File = web3n.files.File;


export class Mounter {

	private readonly mounted = new Map<FS|File, { pathInOS: string; node: NodeWithFile|NodeWithFS }>();

	constructor(
		public readonly mountpoint: string,
		private readonly rootNode: DirectoryNode,
		private readonly rootNodePathInOS: string
	) {
		Object.seal(this);
	}

	async close(): Promise<void> {
		this.rootNode.removeFromTree();
	}

	getPathInOS(f: FS|File): string|undefined {
		return this.mounted.get(f)?.pathInOS;
	}

	private getParentAndNameForMount(path: string[]): {
		parentNode: DirectoryNode; mountName: string; pathInOS: string;
	} {
		path = sanitizePath(path);
		const pathInOS = [ this.rootNodePathInOS, ...path ].join(sep);
		const mountName = path.pop()!;
		let parentNode = this.rootNode;
		while (path.length > 0) {
			const nodeName = path.shift()!;
			parentNode = parentNode.getOrMakeChildDirectoryNode(nodeName);
		}
		return { parentNode, mountName, pathInOS };
	}

	mountFS(path: string[], fs: FS): void {
		if (this.mounted.has(fs)) {
			throw makeMountException({ alreadyMounted: true });
		}
		const { mountName, parentNode, pathInOS } = this.getParentAndNameForMount(path);
		const node = parentNode.mountFS(mountName, fs);
		this.mounted.set(fs, { pathInOS, node });
	}

	mountFile(path: string[], file: File): void {
		if (this.mounted.has(file)) {
			throw makeMountException({ alreadyMounted: true });
		}
		const { mountName, parentNode, pathInOS } = this.getParentAndNameForMount(path);
		const node = parentNode.mountFile(mountName, file);
		this.mounted.set(file, { pathInOS, node });
	}

	unmountPath(path: string[]): void {
		path = sanitizePath(path);
		let node: NodeWithFile | NodeWithFS | DirectoryNode | undefined = this.rootNode;
		while (path.length > 0) {
			node = (node as DirectoryNode).children.get(path.shift()!);
			if (!node) {
				throw makeMountException({ notFound: true });
			} else if ((node instanceof DirectoryNode) && (path.length > 0)) {
				throw makeMountException({ badPath: true, message: `path array is longer than the mountpoint` });
			}
		}
		node.removeFromTree();
		this.removeEmptyParentsOf(node);
	}

	unmountFile(file: File): void {
		const found = this.mounted.get(file);
		if (found) {
			this.mounted.delete(file);
			found.node.removeFromTree();
			this.removeEmptyParentsOf(found.node);
		}
	}

	unmountFolder(fs: FS): void {
		const found = this.mounted.get(fs);
		if (found) {
			this.mounted.delete(fs);
			found.node.removeFromTree();
			this.removeEmptyParentsOf(found.node);
		}
	}

	private removeEmptyParentsOf(node: TreeNode): void {
		const parent = node.parent;
		if (parent && (parent !== this.rootNode) && (parent.children.size === 0)) {
			parent.removeFromTree();
			return this.removeEmptyParentsOf(parent);
		}
	}

}
Object.freeze(Mounter.prototype);
Object.freeze(Mounter);


Object.freeze(exports);