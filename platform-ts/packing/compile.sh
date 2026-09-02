#!/bin/bash

work="$1"

if [ -z "$work" ]
then
	echo "Provide first work argument. Possible values are
	'all'    - compiles all things in required order, and native compilation targeting current platform,
	'protos'    - compiles protobuf definition files to node/commonjs modules, copying files for TypeScript use,
	'platform-ts'    - compiles TypeScript code of a platform,
	'pack-preloads'    - packs preloads for JSEngine and WebView runtimes.
	"
	exit -1
fi

proto_file_to_node() {

	local protos_dir="$1"
	local dst_dir="$2"
	local file=$3

	local pb_file="$dst_dir/$file.js"
	local pb_def="$dst_dir/$file.d.ts"

	local pbjs="./node_modules/.bin/pbjs"
	local pbts="./node_modules/.bin/pbts"

	echo -n "Generating node js for $file ... "
	$pbjs -o "$pb_file" -w commonjs -t static-module "$protos_dir/$file" || return $?
	$pbts -o "$pb_def" "$pb_file" || return $?
	echo " done."
}

rm_and_mk_dir() {
	local dir="$1"
	if [ -d $dir ]
	then
		rm -r "$dir" || return $?
	fi
	mkdir -p "$dir" || return $?
}

compile_protos_to_node() {

	local protos_dir="$1"
	local code_dir="ts-code/$2"
	rm_and_mk_dir $code_dir || return $?
	local build_dir="build/$2"
	rm_and_mk_dir $build_dir || return $?

	local pbjs="./node_modules/.bin/pbjs"
	local pbts="./node_modules/.bin/pbts"

	echo "	=========================================================="
	echo "	|   Transpiling protobuf files from $protos_dir into JS+TS"
	echo "	=========================================================="
	for file in $(ls "$protos_dir")
	do
		proto_file_to_node "$protos_dir" "$code_dir" $file || return $?
	done

	echo -n "Copying to $build_dir ... "
	cp $code_dir/*.proto.js $build_dir/ || return $?
	echo " done."
}

compile_all_protos_to_node() {
	compile_protos_to_node "protos-platform" "platform/protos"
	compile_protos_to_node "protos-runner" "runner-in-android/protos"
}

compile_platform_ts() {

	echo "	============================================"
	echo "	|   Compiling platform's TypeScript code   |"
	echo "	============================================"
	echo -n "Compiling typescript ... "
	tsc -p ts-code || return $?
	echo " done."

}

pack_preload() {
	local folder="$1"
	local file="$2"
	local src_dir="build/runner-in-android/$folder"
	local src_path="$src_dir/$file"

	echo -n "Browserifying preload $file for $folder ... "

	if [ ! -f "$src_path" ]
	then
		echo "File $file in folder $folder - path $src_path - is not a file. Was TypeScript source compiled? Are folder and file arguments correct?"
		return -1
	fi

	dest_dir="$(realpath .)/dist/$folder"
	mkdir -p "$dest_dir" || return $?

	(cd "$src_dir" || exit $?
		browserify $file -o "$dest_dir/$file" || exit $?
	) || return $?

	echo " packed."
}

pack_preloads() {

	echo "	================================================"
	echo "	|   Packing preloads for runtimes on Android   |"
	echo "	================================================"

	for args in \
		"jsengine common-preload.js" \
		"jsengine core-load.js" \
		"jsengine app-preload.js" \
		"webview setup-w3n.bundle.js" \
		"webview setup-w3n-for-startup.bundle.js"
	do
		pack_preload $args || return $?
	done
}


if [ "$work" == "all" ]
then

	compile_all_protos_to_node || exit $?
	echo
	compile_platform_ts || exit $?
	echo
	pack_preloads || exit $?

elif [ "$work" == "protos" ]
then

	compile_all_protos_to_node
	exit $?

elif [ "$work" == "platform-ts" ]
then

	compile_platform_ts
	exit $?

elif [ "$work" == "pack-preloads" ]
then

	pack_preloads
	exit $?

else
	echo "Proper work argument is not given"
	exit 1
fi
