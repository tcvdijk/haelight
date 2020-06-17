// haelight.jsx
// Copyright 2020 Thomas van Dijk
//
// USAGE
// Select one or more text layers, then run the script.
//
// Configure the colors below.
var colors = {
    plain:     {color:"[0.61,0.86,1]", prio:0 },    // #9cdbff
    nonalpha:  {color:"[0.83,0.83,0.83]", prio:3 }, // #d4d4d4
    numbers:   {color:"[0.71,0.81,0.66]", prio:1 }, // #b5cfa8
    fun:       {color:"[0.86,0.86,0.67]", prio:1 }, // #dbdbab
    keyword:   {color:"[0.77,0.53,0.75]", prio:2 }, // #c487bf
    in_angled: {color:"[0.81,0.57,0.47]", prio:3 }, // #cf9178
    type:      {color:"[0.34,0.61,0.84]", prio:3 }, // #579cd6
    comment:   {color:"[0.42,0.60,0.33]", prio:4 }, // #6b9954
    string:    {color:"[0.81,0.57,0.47]", prio:2 }, // #cf9178
    // background suggestion: #2b2b2b
    // bright: #ffffe4
}; 


function cleanup_changes(text,changes,colors) {
    changes.sort( function (x,y) { return x.at-y.at; } );
    // clean up double occurrences
    var out = []
    var at = -1;
    for( var i=0; i<changes.length; ++i ) {
        var c = changes[i];
        if( c.at>=text.length ) {
            break;
        } else if( c.at>at ) {
            at = c.at;
            out.push(c);
            
        } else if( colors[c.color].prio>colors[out[out.length-1].color].prio ) {
            out[out.length-1].color = c.color;
        }
    }
    // find the newlines
    var newlines = []
    var at = 0;
    var limit = 1000000;
    while ( (at=text.indexOf("\r",at)) != -1 && limit > 0) {
        newlines.push(at);
        at = at+1;
        limit = limit-1;
    }
    // correct output indices for newlines
    var newline_correction = 0;
    for( var i=0; i<out.length; ++i ) {
        while( newlines[newline_correction] < out[i].at && newline_correction<newlines.length ) {
            newline_correction = newline_correction+1;
        }
        out[i].at = out[i].at - newline_correction;
    }
    return out;
}
function cst(list,colors,lo,hi) {
    // Driven by compile_search_tree.
    // Recursively generate AE expression search tree for the interval:
    // list[lo].at inclusive, to list[hi+1].at exclusive
    var dist = hi-lo;
    if( dist==0 ) {
        var hi_code = colors[list[lo].color].color;
        return hi_code;
    } else if( dist==1 ) {
        var lo_code = colors[list[lo].color].color;
        var hi_code = colors[list[hi].color].color;
        return "if(i<"+list[hi].at+")"+lo_code+";else "+hi_code+";"
    } else {
        var mid = Math.floor((lo+hi)/2)
        var lo_code = cst(list,colors,lo,mid);
        var hi_code = cst(list,colors,mid+1,hi);
        return "if(i<"+list[mid+1].at+"){"+lo_code+"}else{"+hi_code+"}";
    }
}
function compile_search_tree(list,colors) {
    // generate AE expression from change list
    return cst(list,colors,0,list.length-1);
}
function mark(text,changes,color,regexp) {
    // Add colour changes for all matches of regexp.
    // Overrides all other changes in the matched intervals
    // by moving their position to 1000000. This should probably
    // be some kind of tree structure rather than going through
    // the list every time.
    while ((match = regexp.exec(text)) !== null) {
        var start = match.index;
        var end = regexp.lastIndex;
        for( var i=0; i<changes.length; ++i ) {
            if(start<changes[i].at&&changes[i].at<end) changes[i].at = 1000000;
        }
        changes.push({at:start,color:color});
        changes.push({at:end,color:"plain"});
    }
}
function highlight(layer) {
    //
    // === get some data and set up the animators
    var text = layer.text.sourceText.value.toString();
    // Set up base color
    var animator_setup = layer.Text.Animators.addProperty("ADBE Text Animator");
    animator_setup.name = "Haelight Setup";
    var fillColor_setup = animator_setup.property("ADBE Text Animator Properties").addProperty("ADBE Text Fill Color");
    fillColor_setup.setValue([0,0,0]);
    // Animator for syntax colouring.
    var animator = layer.Text.Animators.addProperty("ADBE Text Animator");
    animator.name = "Haelight Apply";
    var fillColor = animator.property("ADBE Text Animator Properties").addProperty("ADBE Text Fill Color");
    fillColor.setValue([100,100,100]);
    var selector = animator.property("ADBE Text Selectors").addProperty("ADBE Text Expressible Selector");
    
    // Start on "plain" colour at index 0.
    changes = [{at:0,color:"plain"}];
    // Then apply colours based on various regex
    mark(text,changes,"numbers",/\d+/g);
    mark(text,changes,"fun",/\w+\(/g);
    mark(text,changes,"type",/(^|[\s(<>\(\)\{\}\[\]])(unsigned\w+)?(const\w+)?\**(void|char|int|float|double|bool|true|false)(\w+const)?\**($|[\s(<>\(\)\{\}\[\]:;])/g);
    mark(text,changes,"keyword",/(^|[\s(<>\(\)\{\}\[\]])(extern|class|struct|template|typedef|public|protected|private|using|for|while|do|if|else|throw|catch|return|#include)($|[\s(<>\(\)\{\}\[\]:;])/g);
    mark(text,changes,"type",/namespace/g);
    mark(text,changes,"nonalpha",/[\(\)\[\]\{\}+\-*\/;,:<>~=!\?]+/g);
    mark(text,changes,"string",/[“"][^"”]*["”]/g);
    mark(text,changes,"comment",/\/\/[^\r\n]*/g);
    
    // Turn the colour changes into an AE expression
    var list = cleanup_changes(text,changes,colors);
    var intro = "var i=textIndex-1;";
    var search_tree = compile_search_tree(list,colors);
    var compiled_expression = intro + search_tree;

    // Apply it to the animator
    selector.amount.expression = compiled_expression;
}

// Loop over the selected layers and process the text layers
app.beginUndoGroup("Apply hAElight");
var comp = app.project.activeItem;
var selectedLayers = comp.selectedLayers;
var did_something = false;
if( selectedLayers!=null ) {
    for( var i=0; i<comp.selectedLayers.length; ++i ) {
        var layer = comp.selectedLayers[i];
        if( layer.property("Source Text")!=null ) {
            $.writeln("Applying hAElight to ["+layer.name +"].");
            highlight(layer);
            did_something = true;
        } else {
            $.writeln("["+layer.name +"] is a not text layer; skipping.");
        }
    }
}
if( !did_something ) {
    alert( "No text layers selected. Did not do anything." );
}
app.endUndoGroup();