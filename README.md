# atext-changeset
A library for building collaborative rich-text editors using [operational transformation](https://en.wikipedia.org/wiki/Operational_transformation). 

It's based on [easysync](https://github.com/ether/etherpad-lite/tree/develop/doc/easysync) spec from the [Etherpad-Lite](https://github.com/ether/etherpad-lite) project. The format describes rich text document and any changes to it by expressing document and its rich formatting via text with attributes. The representation aims to be compact for quick transfers and effective storage.

This implementation is written from scratch and differs from Etherpad's [Changeset](https://github.com/ether/etherpad-lite/blob/develop/src/static/js/Changeset.js) library and EasySync format in the following ways:

* New attribute operation added: ^X, that removes attribute with index X from the text. Unlike original implementation, the format should be removed explicitly.
* "Remove text" operation should be accompanied by the text and its attributes that is being removed.
* As a result, invert() function is self-sufficient and does not require specific snapshot version to undo the operation.
* There should be no code path or situation without explicit check for operation validity to avoid breaked documents. Nothing slip through the cracks, period.
* It works with natural document representation – lines, not a big string. This reduces computation complexity on big documents.
* Complete tests coverage.


Resulting implementation is fast, solid and reliable. **Bonus**: it's compatible with [ShareJS ottypes API](https://github.com/ottypes/docs) that allows you to easily integrate it with existing OT-aware realtime backend. 

It features all base OT operations:

* Composition
* Transformation
* Invertion
* **Bonus** Position transformation

## Install

In node:
```js
var OT = require('atext-changeset');
```

## Usage

Changeset is an ordered set of operations, there are 4 types of them: 

1. Keep (skip text range),
2. Format (add attributes to the text range)
3. Insert
4. Remove

The changeset can be applied to the ADocument. **ADocument** is an internal rich-text document representation that stores it as an array of lines, where each line is an object containing text and its attributes. Additionaly each document have **Attribute Pool** – a dictionary of all formatting rules used in the document. It allows us to save a lot of bytes in the storage.

To start you need a document, so you either create empty one or start with a plain text:

```js
var doc = OT.ADocument.fromText('hello world');

// or
var doc = new OT.ADocument();

// or, if you've just received something from the database
var doc = OT.ADocument.unpack(data);
```

Now we start changing the document:
```js
var b = OT.Changeset.create(doc, 'stranger');
```
This code will return you a Changeset **Builder**. The document is required, because Builder will validate all changes you're going to make against it, plus fill the gaps for you so you don't have to figure out some details. Notice the last argument, it's optional. Changesets allows you to store author of the change, so you can later figure out who did what.

```js
// keep N chars with L lines
b.keep(N, L);

// format N chars and L lines with attributes
var format = new OT.AttributeList().addFormatOp('bold','true').addRemoveOp('italic','true');
b.format(N, L, format);

// remove all format on the text range
b.removeAllFormat(N, L);

// insert text at the current position
var insertFormat = new OT.AttributeList().addFormatOp('bold','true');
b.insert('hello\nworld', insertFormat);

// remove text range from the current position
b.remove(N, L);

// finish and return Changeset
var cs = b.finish();

// you can also chain calls
var cs2 = OT.Changeset.create(doc).keep(2, 0).insert('hello').remove(4, 1).finish();
```

### IMPORTANT
Notice the **N** and **L** parameters in the calls above. N stands for characters, and L stands for lines. There are few rules about them:

1. N includes L, for example ```'a\nb\n': N=4, L=2```
2. If you specify L>0, you should always complete operation **at the end of the line**. For example: ```'a\nb\n': N=4, L=2``` - VALID, but ```'a\nb': N=3, L=1``` - INVALID
3. That means if you need to remove 2 lines and then 2 more characters, you should split into 2 operations: ```b.remove(4, 2).remove(2, 0);```


## Operational Transformation
Assuming you know what Operational Transformation is, here's a short summary of what's available. All operations are immutable, i.e. they create a new Changeset object instead of touching existing ones.

### Compose
Return a composition of 2 changesets. That is, combines 2 consecutive changes into one.
```js
var res = cs1.compose(cs2);
```

### Transform
Transforms cs1 against cs2, specifying a side: 'left' or 'right'. For own changes usually use 'left', for remote - 'right'.
```js
var res = cs1.transform(cs2, side);
```

### Invert
Easy as it sounds. Inverts the changeset, no strings attached.
```js
var res = cs.invert();
```

### Apply
Modifies document in-place, because cloning it could be resource-unfriendly.
```js
cs.applyTo(doc);
```


## Attributes

Attributes are used to describe formatting. Each attribute is a key/value pair that can be anything. For example, rich text editors can use ```bold: true``` or ```img: http://....jpg``` and then render them accordingly.

There are 2 types of operations for the attributes:

* Format
* Remove format

If you have an ```img``` attribute and want to override its value with different URL, you can't just perform format with the new URL, you should first remove original attribute with ```Remove``` operation, and then ```Format``` it again. This is true for any attribute key, there can't be 2 keys with the same name. But usually you shouldn't bother, ```Builder``` will remove previous value for you.

Creating attributes list:
```js
// creates an empty list
var format = new OT.AttributeList();

// add format attribute
format.addFormatOp(key, value);

// remove format attribute
format.addRemoveOp(key, value);

// or chain calls
var format = new OT.AttributeList().addFormat(...).removeFormat(...);
```

There is one built-in attribute name that shouldn't be explicitly used. It's called ```author``` and stores author of the change, if was specified for the ```Builder```. 

## Position

Position is used for presense awareness and drawing carets and selections of other users in the document (like Google Docs). 
Most of the OT libraries use linear index for the position that only create problems in real life. Seriously, in the editor you have line and character position of the caret, and you should convert it to the linear offset by calculating how many characters you have before the caret, then transform, then split resulting offset again into lines and chars to get the new value in the document space. That's a lot of unnecessary work. 

Here the Position is represented by natural 2-dimension coordinate that can be transformed directly. This makes a huge difference.

```js
var pos = new Position(char, line);

// transform it against changeset
var newPos = cs.transformPosition(pos);
```

## Storage and transport

Before storing or sending a changeset you need to pack it. Just do ```var res = cs.pack()```. Of course before working with received changeset, don't forget to unpack it first: ```var cs = OT.Changeset.unpack(data)```. Documents can do the same.


## TODO

- [ ] Figure out the best way to build for browser.
- [ ] Create a good client API to iterate over ADocument
- [ ] Describe how it integrates with ShareJS.
- [ ] Add some tests for ADocument class and find what could be missing.
- [ ] Implement diff algorithm from Etherpad

## License
MIT

## Changelog

0.1 
* Initial release
