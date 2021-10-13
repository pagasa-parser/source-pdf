# @pagasa-parser/source-pdf
[![npm version](https://img.shields.io/npm/v/@pagasa-parser/source-pdf.svg?style=flat-square)](https://www.npmjs.org/package/@pagasa-parser/source-pdf)
[![npm downloads](https://img.shields.io/npm/dm/@pagasa-parser/source-pdf.svg?style=flat-square)](http://npm-stat.com/charts.html?package=@pagasa-parser/source-pdf)
This plugin for [pagasa-parser](https://github.com/ChlodAlejanro/pagasa-parser) allows for parsing of PAGASA Tropical Cyclone Bulletins (TCBs). It only supports Tropical Cyclone Bulletin-type PDFs and **not** Severe Weather Bulletin-type PDFs, which were phased out in early 2021. Support for these types of bulletins are planned for the future.

This package requires Java to be available in the PATH, as it relies on [tabula-java](https://github.com/tabulapdf/tabula-java).
