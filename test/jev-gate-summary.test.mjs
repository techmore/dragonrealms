import test from 'node:test';
import assert from 'node:assert/strict';
import { distinctLaneSummary } from '../public/js/jev-gate-summary.js';

test('distinct-lane summary counts a ranked skill once across repeated Nth rows',()=>{
  const rows=[1,2,3,4].map(n=>({label:`${n}${n===1?'st':n===2?'nd':n===3?'rd':'th'} weapon`,
    eligible:['small_edged','brawling','blunt']}));
  rows.push({label:'1st armor',eligible:['light_armor','shield_usage']},
    {label:'2nd armor',eligible:['light_armor','shield_usage']},
    {label:'1st survival',eligible:['foraging','stealth']});
  assert.equal(distinctLaneSummary(rows,{small_edged:10,brawling:0,light_armor:3,foraging:0}),
    'armor 1/2 ranked · 1 unknown · survival 0/1 ranked · 1 known zero · 1 unknown · weapon 1/4 ranked · 1 known zero · 1 unknown');
});

test('distinct-lane summary never describes an omitted mindstate skill as rank zero',()=>{
  const rows=[{label:'4th weapon',eligible:['small_edged','brawling','blunt','bow']}];
  assert.equal(distinctLaneSummary(rows,{small_edged:9,brawling:0}),
    'weapon 1/4 ranked · 1 known zero · 2 unknown');
});

test('distinct-lane summary returns unknown for unavailable requirements',()=>{
  assert.equal(distinctLaneSummary([],{}),'unknown');
  assert.equal(distinctLaneSummary(null,{}),'unknown');
});
