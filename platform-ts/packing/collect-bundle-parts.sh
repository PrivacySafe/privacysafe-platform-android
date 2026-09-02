#!/bin/bash

# Check that current directory is project's top level
if [ ! -d packing ] || [ ! -d ts-code ]
then echo "Can't run from $(pwd)" ; exit 1 ; fi

source packing/versioning.sh


brand="PrivacySafe"
versions_dir="dist/bundle.versions"

echo "---------- Task overview ----------------
This downloads apps that should be bundled with $brand platform
-----------------------------------------
"

download() {
	local pack_type=$1
	if [ "$pack_type" != "apps" ] && [ "$pack_type" != "app-packs" ]
	then
		echo "Incorrect apps pack type given: $pack_type"
		return -1
	fi
	local dst_dir="dist/bundled-$pack_type"
	local vers_dir="$versions_dir/$pack_type"
	if [ ! -d $dst_dir ]
	then
		mkdir $dst_dir || return $?
	else
		rm -rf $dst_dir/* || return $?
	fi
	echo "   Downloading apps into $dst_dir"
	echo
	for app in $(ls $vers_dir)
	do
		bash packing/download-app.sh $(
			app_zip_url $brand $app $(cat $vers_dir/$app)
		) $app $dst_dir "unzip" || return $?
		echo
	done
}

download apps || exit $?

download app-packs || exit $?
