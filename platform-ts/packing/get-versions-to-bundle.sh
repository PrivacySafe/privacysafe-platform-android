#!/bin/bash

# Check that current directory is project's top level
if [ ! -d packing ] || [ ! -d ts-code ]
then echo "Can't run from $(pwd)" ; exit 1 ; fi

source packing/versioning.sh

brand="PrivacySafe"
channel="nightly"
versions_file="dist/bundle.versions"

echo "---------- Task overview ----------------
This collects apps' versions into to make $brand $channel bundle.
-----------------------------------------
"

packs_dir="dist/bundled-app-packs"
apps_dir="dist/bundled-apps"
for dir in $packs_dir $apps_dir
do
	if [ -d $dir ]
	then
		rm -r $dir
	fi
	mkdir -p $dir
done

channel="nightly"
versions_url="https://3nsoft.com/downloads/$brand/$channel/android/versions-in-bundle.json"

curl --silent "$versions_url" --output $versions_file

apps="$(cat $versions_file | jq -r .apps | jq -r keys[])"
for app in $apps
do
	app_version="$(cat $versions_file | jq -r .apps[\"$app\"])"
	bash packing/download-app.sh $(app_zip_url $brand $app $app_version) $app $apps_dir "unzip" || exit $?
	echo
done

app_packs="$(cat $versions_file | jq -r .\"app-packs\" | jq -r keys[])"
for app in $app_packs
do
	app_version="$(cat $versions_file | jq -r .\"app-packs\"[\"$app\"])"
	bash packing/download-app.sh $(app_zip_url $brand $app $app_version) $app $packs_dir "unzip" || exit $?
	echo
done
